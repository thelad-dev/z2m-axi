import { AxiError } from "axi-sdk-js";

function flagEqualsPrefix(flag: string): string {
  return `${flag}=`;
}

export function requireFlagValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new AxiError(`${flag} requires a value`, "VALIDATION_ERROR", [
      `Pass ${flag}=... if the value begins with --`,
    ]);
  }
  return value;
}

export function takeFlag(args: string[], flag: string): string | undefined {
  const equalsPrefix = flagEqualsPrefix(flag);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === flag) {
      const val = requireFlagValue(args, i, flag);
      args.splice(i, 2);
      return val;
    }
    if (arg.startsWith(equalsPrefix)) {
      const val = arg.slice(equalsPrefix.length);
      args.splice(i, 1);
      return val;
    }
  }
  return undefined;
}

export function takeBoolFlag(args: string[], flag: string): boolean {
  const idx = args.indexOf(flag);
  if (idx === -1) return false;
  args.splice(idx, 1);
  return true;
}

export function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

export function requireNonEmptyFlagValue(flag: string, value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value.trim() === "") {
    throw new AxiError(`${flag} requires a value`, "VALIDATION_ERROR", [
      `Pass ${flag}=... with a non-empty value`,
    ]);
  }
  return value;
}

export function parseNonNegativeIntegerFlag(
  flag: string,
  raw: string | undefined,
  fallback: number,
): number {
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new AxiError(`${flag} must be a non-negative integer`, "VALIDATION_ERROR");
  }
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new AxiError(`${flag} must be a non-negative integer`, "VALIDATION_ERROR");
  }
  return n;
}

export function assertNoUnknownFlags(args: string[], allowed: string[]): void {
  const allowedSet = new Set(allowed);
  for (const arg of args) {
    if (!arg.startsWith("-")) continue;
    if (arg === "--help" || arg === "-h") continue;
    const name = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
    if (!allowedSet.has(name)) {
      throw new AxiError(`unknown flag ${name}`, "VALIDATION_ERROR", [
        `valid flags: ${allowed.join(", ")} (--help always allowed)`,
      ]);
    }
  }
}

export function takePositional(args: string[]): string[] {
  return args.filter((a) => !a.startsWith("-"));
}

export function stripFlags(args: string[], flagsWithValue: string[], boolFlags: string[]): string[] {
  const rest = [...args];
  for (const f of flagsWithValue) takeFlag(rest, f);
  for (const f of boolFlags) takeBoolFlag(rest, f);
  return rest;
}
