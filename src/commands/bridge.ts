import { AxiError } from "axi-sdk-js";
import { assertNoUnknownFlags, takePositional } from "../args.js";
import { withClient } from "../client.js";
import type { CliContext } from "../context.js";
import { withGlobals } from "../context.js";
import { filterDevices, summarizeBridge } from "../format.js";
import type { Output } from "../output.js";

export const BRIDGE_HELP = `usage: z2m-axi bridge <subcommand>
subcommands[1]:
  info   Show Zigbee2MQTT bridge version, network, permit-join
flags[4]:
  --url <url>, --token <token>, --timeout <ms>, --config <path>
examples:
  z2m-axi bridge info
  z2m-axi bridge info --url http://192.168.1.10:8080
`;

export async function bridgeCommand(
  args: string[],
  ctx: CliContext,
): Promise<Output> {
  const positionals = takePositional(args);
  const sub = positionals[0] ?? "info";
  if (sub === "info") {
    assertNoUnknownFlags(args, ["--url", "--token", "--timeout", "--config"]);
    return bridgeInfo(ctx);
  }
  throw new AxiError(`unknown bridge subcommand: ${sub}`, "VALIDATION_ERROR", [
    "valid subcommands: info",
    "Run `z2m-axi bridge --help`",
  ]);
}

async function bridgeInfo(ctx: CliContext): Promise<Output> {
  const snap = await withClient(
    ctx.config,
    (c) => c.ensureSnapshot(),
    ctx.clientOptions,
  );
  const info = snap.info;
  if (!info) {
    throw new AxiError("bridge/info not received from frontend", "Z2M_ERROR", [
      "Is Zigbee2MQTT running and the frontend enabled?",
      withGlobals("z2m-axi config show", ctx.suggestionGlobals),
    ]);
  }

  const devices = filterDevices(snap.devices ?? []);
  const out: Output = {
    target: ctx.config.baseUrl,
    ...summarizeBridge(info),
    devices: devices.length,
  };

  // Include a few more useful fields in the detail view.
  if (info.zigbee_herdsman?.version) {
    out.herdsman = info.zigbee_herdsman.version;
  }
  if (info.zigbee_herdsman_converters?.version) {
    out.converters = info.zigbee_herdsman_converters.version;
  }
  if (info.log_level) out.log_level = info.log_level;
  if (info.os?.version) out.os = info.os.version;
  // mqtt.server may contain credentials in rare setups — only show host-ish form if plain
  if (info.mqtt?.server) {
    out.mqtt_server = redactMqttServer(info.mqtt.server);
  }

  return out;
}

function redactMqttServer(server: string): string {
  try {
    const u = new URL(server);
    if (u.password) u.password = "***";
    if (u.username) u.username = u.username ? "***" : "";
    return u.toString();
  } catch {
    return server.replace(/\/\/([^/@]+)@/, "//***@");
  }
}
