import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Leaf module: node builtins only — safe for --version fast path. */
export const VERSION = readPackageVersion();

function readPackageVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    join(here, "..", "package.json"),
    join(here, "..", "..", "package.json"),
  ]) {
    if (!existsSync(candidate)) continue;
    try {
      const parsed = JSON.parse(readFileSync(candidate, "utf8")) as {
        name?: string;
        version?: string;
      };
      if (
        parsed.name === "z2m-axi" &&
        typeof parsed.version === "string" &&
        parsed.version.length > 0
      ) {
        return parsed.version;
      }
    } catch {
      // try next candidate
    }
  }
  return "0.0.0";
}
