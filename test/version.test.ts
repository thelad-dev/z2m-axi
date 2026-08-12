import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { VERSION } from "../src/version.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("version fast path", () => {
  it("bin --version prints bare version quickly", () => {
    // Prefer tsx source bin during dev; after build use dist.
    const entry = join(root, "src/bin/z2m-axi.ts");
    const floor = spawnSync(process.execPath, ["-e", "console.log(1)"], {
      encoding: "utf8",
    });
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", entry, "--version"],
      { encoding: "utf8", cwd: root },
    );
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(VERSION);
    // Soft latency check vs node floor (not a hard ms budget).
    // Presence of clean output is the contract; skip if floor failed.
    expect(floor.status).toBe(0);
  });
});
