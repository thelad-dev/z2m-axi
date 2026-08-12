import { AxiError } from "axi-sdk-js";
import type { Output } from "../output.js";
import {
  assertNoUnknownFlags,
  parseNonNegativeIntegerFlag,
  takeFlag,
  takePositional,
} from "../args.js";
import { assertResponseOk, withClient } from "../client.js";
import { requireConfirmation } from "../confirm.js";
import type { CliContext } from "../context.js";
import { withGlobals } from "../context.js";

export const PERMIT_JOIN_HELP = `usage: z2m-axi permit-join <on|off> [flags]
Open or close the Zigbee network for new devices (mutation; requires confirmation).

args:
  on    Allow joining (default --time 254 seconds)
  off   Disallow joining (time 0)
flags[6]:
  --time <seconds>   Join window 1-254 when on (default 254); ignored for off
  --device <id>       Limit join through a specific router (ieee or friendly_name)
  --confirm <token>  Required non-interactively: "permit-join" (on) or "permit-join-off" (off)
  --url, --token, --timeout, --config
examples:
  z2m-axi permit-join on --time 120 --confirm permit-join
  z2m-axi permit-join off --confirm permit-join-off
  z2m-axi permit-join on --device kitchen_router --confirm permit-join
`;

const DEFAULT_JOIN_TIME = 254;

export async function permitJoinCommand(
  args: string[],
  ctx: CliContext,
): Promise<Output> {
  const working = [...args];
  const timeRaw = takeFlag(working, "--time");
  const device = takeFlag(working, "--device");
  const confirmFlag = takeFlag(working, "--confirm");
  takeFlag(working, "--url");
  takeFlag(working, "--token");
  takeFlag(working, "--timeout");
  takeFlag(working, "--config");
  assertNoUnknownFlags(working, [
    "--time",
    "--device",
    "--confirm",
    "--url",
    "--token",
    "--timeout",
    "--config",
  ]);

  const positionals = takePositional(working);
  const mode = (positionals[0] ?? "").toLowerCase();
  if (positionals.length !== 1 || (mode !== "on" && mode !== "off")) {
    throw new AxiError(
      "permit-join requires on or off",
      "VALIDATION_ERROR",
      [
        "Run `z2m-axi permit-join on --confirm permit-join`",
        "Run `z2m-axi permit-join off --confirm permit-join-off`",
      ],
    );
  }

  let time: number;
  if (mode === "off") {
    time = 0;
    if (timeRaw !== undefined) {
      throw new AxiError(
        "--time is not valid with permit-join off",
        "VALIDATION_ERROR",
        ["Run `z2m-axi permit-join off --confirm permit-join-off`"],
      );
    }
  } else {
    time = parseNonNegativeIntegerFlag("--time", timeRaw, DEFAULT_JOIN_TIME);
    if (time < 1 || time > 254) {
      throw new AxiError("--time must be between 1 and 254", "VALIDATION_ERROR");
    }
  }

  const confirmToken = mode === "on" ? "permit-join" : "permit-join-off";
  const summary =
    mode === "on"
      ? `open network for joining (${time}s${device ? `, via ${device}` : ""})`
      : "close network (disallow joining)";

  await requireConfirmation({
    token: confirmToken,
    summary,
    confirmFlag,
  });

  // Idempotent: if already in desired state, still send (Z2M accepts) but note it.
  const before = await withClient(
    ctx.config,
    (c) => c.ensureSnapshot(),
    ctx.clientOptions,
  );
  const alreadyOn = before.info?.permit_join === true;
  const alreadyOff = before.info?.permit_join === false;
  const already =
    (mode === "on" && alreadyOn && !device) || (mode === "off" && alreadyOff);

  const payload: Record<string, unknown> = { time };
  if (device) payload.device = device;

  const data = await withClient(
    ctx.config,
    async (c) => {
      const response = await c.request("bridge/request/permit_join", payload);
      return assertResponseOk(response, "permit-join") as {
        time?: number;
        device?: string;
      };
    },
    ctx.clientOptions,
  );

  const out: Output = {
    ok:
      mode === "on"
        ? `permit_join enabled for ${data?.time ?? time}s`
        : "permit_join disabled",
    permit_join: mode === "on",
    time: data?.time ?? time,
  };
  if (data?.device) out.device = data.device;
  if (already) out.already = true;

  out.help =
    mode === "on"
      ? [
          withGlobals(
            "z2m-axi permit-join off --confirm permit-join-off",
            ctx.suggestionGlobals,
          ),
          withGlobals("z2m-axi device list", ctx.suggestionGlobals),
        ]
      : [withGlobals("z2m-axi bridge info", ctx.suggestionGlobals)];

  return out;
}
