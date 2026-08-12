import { encode } from "@toon-format/toon";
import { AxiError, runAxiCli } from "axi-sdk-js";
import { bridgeCommand } from "./commands/bridge.js";
import { configCommand } from "./commands/config.js";
import { deviceCommand } from "./commands/device.js";
import { homeCommand } from "./commands/home.js";
import { permitJoinCommand } from "./commands/permit-join.js";
import { setupCommand } from "./commands/setup.js";
import { takeFirstPositional } from "./args.js";
import type { Z2mClientOptions } from "./client.js";
import { parseGlobalFlags, type CliContext } from "./context.js";
import {
  BRIDGE_HELP,
  CONFIG_HELP,
  DESCRIPTION,
  DEVICE_HELP,
  PERMIT_JOIN_HELP,
  SETUP_HELP,
  TOP_LEVEL_HELP,
} from "./help.js";
import { VERSION } from "./version.js";

const USAGE_CODES = new Set([
  "VALIDATION_ERROR",
  "CONFIRM_REQUIRED",
  "CONFIRM_DECLINED",
]);

export interface MainOptions {
  argv?: string[];
  stdout?: { write: (chunk: string) => unknown };
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
  clientOptions?: Omit<Z2mClientOptions, "config">;
}

function formatError(error: unknown): { output: string; exitCode: number } {
  if (error instanceof AxiError) {
    const out: Record<string, unknown> = {
      error: error.message,
      code: error.code,
    };
    if (error.suggestions.length > 0) out.help = error.suggestions;
    return {
      output: `${encode(out)}\n`,
      exitCode: USAGE_CODES.has(error.code) ? 2 : 1,
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    output: `${encode({ error: redact(message), code: "UNKNOWN" })}\n`,
    exitCode: 1,
  };
}

function redact(message: string): string {
  return message
    .replace(/(token|password|passwd|secret|auth)(=|:)\s*([^\s,;]+)/gi, "$1$2***")
    .replace(/Bearer\s+\S+/gi, "Bearer ***");
}

function withContext(
  handler: (
    args: string[],
    ctx: CliContext,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>,
  options: MainOptions,
  parseOptions: { consumeConnectionFlags?: boolean } = {},
): (args: string[]) => Record<string, unknown> | Promise<Record<string, unknown>> {
  return (args: string[]) => {
    const { stripped, context } = parseGlobalFlags(args, {
      homeDir: options.homeDir,
      env: options.env,
      clientOptions: options.clientOptions,
      consumeConnectionFlags: parseOptions.consumeConnectionFlags,
    });
    return handler(stripped, context);
  };
}

export async function main(options: MainOptions = {}): Promise<void> {
  const argv = options.argv ?? process.argv.slice(2);

  await runAxiCli({
    argv,
    description: DESCRIPTION,
    version: VERSION,
    topLevelHelp: TOP_LEVEL_HELP,
    ...(options.stdout ? { stdout: options.stdout } : {}),
    formatError,
    home: withContext(homeCommand, options),
    getCommandHelp: (command) => {
      switch (command) {
        case "device":
          return DEVICE_HELP;
        case "bridge":
          return BRIDGE_HELP;
        case "permit-join":
          return PERMIT_JOIN_HELP;
        case "config":
          return CONFIG_HELP;
        case "setup":
          return SETUP_HELP;
        default:
          return null;
      }
    },
    commands: {
      device: withContext(deviceCommand, options),
      bridge: withContext(bridgeCommand, options),
      "permit-join": withContext(permitJoinCommand, options),
      config: (args) => {
        // `config set` owns --url/--token/--timeout; do not strip them as connection globals.
        // Detect first true positional so flags before `set` still reach configSet.
        const peek = [...args];
        const sub = takeFirstPositional(peek, [
          "--url",
          "--token",
          "--timeout",
          "--config",
        ]);
        const isSet = sub === "set";
        return withContext(configCommand, options, {
          consumeConnectionFlags: !isSet,
        })(args);
      },
      setup: (args) => setupCommand(args),
    },
  });
}
