/**
 * Pi subprocess runner for pi-omni-compact.
 *
 * Spawns a pi subprocess in JSON mode with read-only tools and pi-read-map,
 * parses the JSON event stream, and extracts the final assistant text.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { ResolvedModel } from "./models.js";

/**
 * Resolve the path to pi-read-map extension.
 * Checks common installation locations.
 */
function findPiReadMap(): string | undefined {
  const candidates = [
    path.join(os.homedir(), ".pi/agent/extensions/pi-read-map"),
    path.join(os.homedir(), "projects/pi-read-map"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Spawn a pi subprocess to generate a summarization.
 */
export async function runSummarizationAgent(
  input: string,
  systemPrompt: string,
  model: ResolvedModel,
  signal: AbortSignal,
  cwd: string
): Promise<string | undefined> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-omni-compact-"));
  const inputFile = path.join(tmpDir, "input.md");
  const promptFile = path.join(tmpDir, "system-prompt.md");

  try {
    fs.writeFileSync(inputFile, input, { encoding: "utf8", mode: 0o600 });
    fs.writeFileSync(promptFile, systemPrompt, {
      encoding: "utf8",
      mode: 0o600,
    });

    const args: string[] = [
      "--mode",
      "json",
      "-p",
      "--no-session",
      "--provider",
      model.provider,
      "--model",
      model.model,
      "--thinking",
      model.thinking,
      "--tools",
      "read,grep,find,ls",
      "--system-prompt",
      promptFile,
    ];

    // Add pi-read-map extension if available
    const piReadMapPath = findPiReadMap();
    if (piReadMapPath) {
      args.push("-e", piReadMapPath);
    }

    // Input file reference and task instruction
    args.push(
      `@${inputFile}`,
      "Produce an enhanced compaction summary. Read any referenced files that would help preserve important context."
    );

    let finalText: string | undefined;
    let wasAborted = false;

    const exitCode = await new Promise<number>((resolve) => {
      const proc = spawn("pi", args, {
        cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, PI_API_KEY: model.apiKey },
      });

      let buffer = "";

      const processLine = (line: string) => {
        if (!line.trim()) {
          return;
        }
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(line);
        } catch {
          return;
        }

        if (event.type === "message_end" && event.message) {
          const msg = event.message as {
            role?: string;
            content?: { type?: string; text?: string }[];
          };
          if (msg.role === "assistant" && Array.isArray(msg.content)) {
            const textParts: string[] = [];
            for (const block of msg.content) {
              if (block.type === "text" && block.text) {
                textParts.push(block.text);
              }
            }
            if (textParts.length > 0) {
              finalText = textParts.join("\n");
            }
          }
        }
      };

      proc.stdout.on("data", (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          processLine(line);
        }
      });

      proc.stderr.on("data", () => {
        // Discard stderr — errors are handled via exit code
      });

      proc.on("close", (code: number | null) => {
        if (buffer.trim()) {
          processLine(buffer);
        }
        resolve(code ?? 1);
      });

      proc.on("error", () => {
        resolve(1);
      });

      // Abort handling
      const killProc = () => {
        wasAborted = true;
        proc.kill("SIGTERM");
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill("SIGKILL");
          }
        }, 5000);
      };

      if (signal.aborted) {
        killProc();
      } else {
        signal.addEventListener("abort", killProc, { once: true });
      }
    });

    if (wasAborted) {
      return undefined;
    }
    if (exitCode !== 0) {
      return undefined;
    }
    if (!finalText?.trim()) {
      return undefined;
    }

    return finalText;
  } finally {
    // Clean up temp files
    try {
      fs.unlinkSync(inputFile);
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(promptFile);
    } catch {
      /* ignore */
    }
    try {
      fs.rmdirSync(tmpDir);
    } catch {
      /* ignore */
    }
  }
}
