import { AxiError, installSessionStartHooks } from "axi-sdk-js";
import { assertNoUnknownFlags, takePositional } from "../args.js";
import type { Output } from "../output.js";

export const SETUP_HELP = `usage: z2m-axi setup hooks
Install or repair agent SessionStart hooks for z2m-axi ambient context.

Supported integrations: Claude Code, Codex, OpenCode.

examples:
  z2m-axi setup hooks
`;

export async function setupCommand(args: string[]): Promise<Output> {
  const working = [...args];
  assertNoUnknownFlags(working, []);
  const positionals = takePositional(working);
  if (positionals.length !== 1 || positionals[0] !== "hooks") {
    throw new AxiError("unknown setup action", "VALIDATION_ERROR", [
      "Run `z2m-axi setup hooks`",
    ]);
  }

  installSessionStartHooks({
    marker: "z2m-axi",
    binaryNames: ["z2m-axi"],
  });

  return {
    setup: "hooks installed or already up to date",
    integrations: ["Claude Code", "Codex", "OpenCode"],
    help: [
      "Restart your agent session to receive z2m-axi ambient context",
      "Or install the skill: npx skills add thelad-dev/z2m-axi --skill z2m-axi",
    ],
  };
}
