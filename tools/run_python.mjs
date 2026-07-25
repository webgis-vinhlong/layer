#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const candidates =
  process.platform === "win32"
    ? [
        { command: "py", prefix: ["-3"] },
        { command: "python", prefix: [] },
        { command: "python3", prefix: [] },
      ]
    : [
        { command: "python3", prefix: [] },
        { command: "python", prefix: [] },
      ];

export function runPythonSync(args, options = {}) {
  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, [...candidate.prefix, ...args], {
      stdio: "inherit",
      ...options,
    });
    if (result.error?.code === "ENOENT") continue;
    return { ...result, command: candidate.command };
  }

  return {
    error: new Error(
      "Không tìm thấy Python 3. Hãy cài Python 3.10+ và bật tùy chọn Add Python to PATH.",
    ),
    status: 1,
    command: null,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = runPythonSync(process.argv.slice(2));
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}
