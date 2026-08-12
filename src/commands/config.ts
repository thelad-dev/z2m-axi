import { AxiError } from "axi-sdk-js";
import {
  assertNoUnknownFlags,
  parseNonNegativeIntegerFlag,
  takeBoolFlag,
  takeFlag,
  takePositional,
} from "../args.js";
import {
  defaultConfigPath,
  loadConfigFile,
  maskSecret,
  writeConfigFile,
  type Z2mConfigFile,
} from "../config.js";
import type { CliContext } from "../context.js";
import type { Output } from "../output.js";

export const CONFIG_HELP = `usage: z2m-axi config <show|set>
Manage local connection settings (~/.config/z2m-axi/config.json).

subcommands:
  show   Print resolved settings (auth token masked)
  set    Write base URL / token / timeout to the config file
flags for set[5]:
  --url <url>          Frontend base URL (http://host:8080)
  --token <token>      Frontend auth_token (stored mode 0600; never echoed)
  --clear-token        Remove stored auth token
  --timeout <ms>       Request timeout
  --config <path>      Alternate config path
examples:
  z2m-axi config show
  z2m-axi config set --url http://192.168.1.10:8080
  z2m-axi config set --token "$Z2M_TOKEN"
  z2m-axi config set --clear-token
`;

export async function configCommand(
  args: string[],
  ctx: CliContext,
): Promise<Output> {
  const working = [...args];
  // Don't consume set flags before routing — only peek subcommand.
  const positionals = takePositional([...working]);
  const sub = positionals[0];
  if (!sub) {
    throw new AxiError("config subcommand required", "VALIDATION_ERROR", [
      "valid subcommands: show, set",
      "Run `z2m-axi config --help`",
    ]);
  }
  if (sub === "show") return configShow(args, ctx);
  if (sub === "set") return configSet(args, ctx);
  throw new AxiError(`unknown config subcommand: ${sub}`, "VALIDATION_ERROR", [
    "valid subcommands: show, set",
  ]);
}

function configShow(args: string[], ctx: CliContext): Output {
  const working = [...args];
  // drop subcommand
  const idx = working.indexOf("show");
  if (idx >= 0) working.splice(idx, 1);
  takeFlag(working, "--url");
  takeFlag(working, "--token");
  takeFlag(working, "--timeout");
  takeFlag(working, "--config");
  assertNoUnknownFlags(working, ["--url", "--token", "--timeout", "--config"]);
  if (takePositional(working).length > 0) {
    throw new AxiError("config show takes no arguments", "VALIDATION_ERROR");
  }

  const c = ctx.config;
  return {
    config_path: c.configPath,
    base_url: c.baseUrl,
    base_url_source: c.sources.baseUrl,
    auth_token: maskSecret(c.authToken) ?? "(not set)",
    auth_token_source: c.sources.authToken,
    timeout_ms: c.timeoutMs,
    timeout_source: c.sources.timeoutMs,
    env_overrides: {
      Z2M_URL: "base URL",
      Z2M_TOKEN: "frontend auth token",
      Z2M_TIMEOUT_MS: "timeout ms",
    },
  };
}

function configSet(args: string[], ctx: CliContext): Output {
  const working = [...args];
  const idx = working.indexOf("set");
  if (idx >= 0) working.splice(idx, 1);

  const url = takeFlag(working, "--url");
  const token = takeFlag(working, "--token");
  const clearToken = takeBoolFlag(working, "--clear-token");
  const timeoutRaw = takeFlag(working, "--timeout");
  const configPathFlag = takeFlag(working, "--config");
  takeFlag(working, "--url"); // already taken
  assertNoUnknownFlags(working, [
    "--url",
    "--token",
    "--clear-token",
    "--timeout",
    "--config",
  ]);
  if (takePositional(working).length > 0) {
    throw new AxiError("config set takes no positional arguments", "VALIDATION_ERROR", [
      "Run `z2m-axi config set --url http://host:8080`",
    ]);
  }

  if (token !== undefined && clearToken) {
    throw new AxiError("use either --token or --clear-token, not both", "VALIDATION_ERROR");
  }

  if (url === undefined && token === undefined && !clearToken && timeoutRaw === undefined) {
    throw new AxiError(
      "config set requires at least one of --url, --token, --clear-token, --timeout",
      "VALIDATION_ERROR",
    );
  }

  const path = configPathFlag ?? ctx.config.configPath ?? defaultConfigPath();
  const current = loadConfigFile(path);
  const next: Z2mConfigFile = { ...current };

  if (url !== undefined) {
    if (!/^https?:\/\//i.test(url.trim())) {
      throw new AxiError("base URL must start with http:// or https://", "VALIDATION_ERROR");
    }
    next.baseUrl = url.trim().replace(/\/+$/, "");
  }
  if (token !== undefined) {
    if (token.trim() === "") {
      throw new AxiError("--token requires a non-empty value (or use --clear-token)", "VALIDATION_ERROR");
    }
    next.authToken = token;
  }
  if (clearToken) {
    delete next.authToken;
  }
  if (timeoutRaw !== undefined) {
    const n = parseNonNegativeIntegerFlag("--timeout", timeoutRaw, 10_000);
    if (n < 1) {
      throw new AxiError("--timeout must be a positive integer (ms)", "VALIDATION_ERROR");
    }
    next.timeoutMs = n;
  }

  writeConfigFile(path, next);

  return {
    ok: `config written to ${path}`,
    base_url: next.baseUrl ?? "(unset)",
    auth_token: maskSecret(next.authToken) ?? "(not set)",
    timeout_ms: next.timeoutMs ?? "(default)",
    help: ["Run `z2m-axi` to verify connectivity", "Run `z2m-axi config show`"],
  };
}
