import { AxiError } from "axi-sdk-js";
import {
  parseNonNegativeIntegerFlag,
  requireNonEmptyFlagValue,
  takeFlag,
} from "./args.js";
import type { Z2mClientOptions } from "./client.js";
import { resolveConfig, type ResolvedConfig } from "./config.js";

export interface CliContext {
  config: ResolvedConfig;
  /** Extra client options (tests inject WebSocket). */
  clientOptions?: Omit<Z2mClientOptions, "config">;
  /** Globals to echo into help suggestions (never includes token). */
  suggestionGlobals: string[];
}

export interface ParseGlobalsResult {
  stripped: string[];
  context: CliContext;
}

/**
 * Pull connection globals from args.
 * Supported: --url, --token, --timeout, --config
 * Token is never echoed into suggestion globals.
 */
export function parseGlobalFlags(
  args: string[],
  options: {
    homeDir?: string;
    env?: NodeJS.ProcessEnv;
    clientOptions?: Omit<Z2mClientOptions, "config">;
    /**
     * When false, leave --url/--token/--timeout for the command (used by `config set`).
     * --config is still consumed so the target file path resolves.
     */
    consumeConnectionFlags?: boolean;
  } = {},
): ParseGlobalsResult {
  const stripped = [...args];
  const consume = options.consumeConnectionFlags !== false;
  const urlFlag = consume
    ? requireNonEmptyFlagValue("--url", takeFlag(stripped, "--url"))
    : undefined;
  const tokenFlag = consume ? takeFlag(stripped, "--token") : undefined;
  const timeoutRaw = consume ? takeFlag(stripped, "--timeout") : undefined;
  const configPath = requireNonEmptyFlagValue("--config", takeFlag(stripped, "--config"));

  let timeoutFlag: number | undefined;
  if (timeoutRaw !== undefined) {
    const n = parseNonNegativeIntegerFlag("--timeout", timeoutRaw, 10_000);
    if (n < 1) {
      throw new AxiError("--timeout must be a positive integer (ms)", "VALIDATION_ERROR");
    }
    timeoutFlag = n;
  }

  const config = resolveConfig({
    homeDir: options.homeDir,
    env: options.env,
    urlFlag,
    tokenFlag: tokenFlag === undefined ? undefined : tokenFlag,
    timeoutFlag,
    configPath,
  });

  const suggestionGlobals: string[] = [];
  if (urlFlag) suggestionGlobals.push(`--url ${shellQuote(urlFlag)}`);
  if (configPath) suggestionGlobals.push(`--config ${shellQuote(configPath)}`);

  return {
    stripped,
    context: {
      config,
      clientOptions: options.clientOptions,
      suggestionGlobals,
    },
  };
}

function shellQuote(value: string): string {
  if (/^[a-zA-Z0-9_./:=+-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

/** Append known globals onto a suggested command. */
export function withGlobals(command: string, globals: string[]): string {
  if (globals.length === 0) return command;
  return `${command} ${globals.join(" ")}`;
}
