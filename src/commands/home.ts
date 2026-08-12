import { withClient } from "../client.js";
import type { CliContext } from "../context.js";
import { withGlobals } from "../context.js";
import { filterDevices, summarizeBridge } from "../format.js";
import type { Output } from "../output.js";

export async function homeCommand(
  _args: string[],
  ctx: CliContext,
): Promise<Output> {
  const snap = await withClient(
    ctx.config,
    (c) => c.ensureSnapshot(),
    ctx.clientOptions,
  );

  const devices = snap.devices ?? [];
  const usable = filterDevices(devices);
  const byType: Record<string, number> = {};
  for (const d of usable) {
    const t = d.type ?? "unknown";
    byType[t] = (byType[t] ?? 0) + 1;
  }
  const interviewPending = usable.filter(
    (d) => d.interview_state && d.interview_state !== "SUCCESSFUL",
  ).length;
  const unsupported = usable.filter((d) => d.supported === false).length;

  const help = [
    withGlobals("z2m-axi device list", ctx.suggestionGlobals),
    withGlobals("z2m-axi bridge info", ctx.suggestionGlobals),
    withGlobals("z2m-axi device show <ieee|friendly_name>", ctx.suggestionGlobals),
  ];
  if (snap.info?.permit_join) {
    help.unshift(
      withGlobals(
        "z2m-axi permit-join off --confirm permit-join-off",
        ctx.suggestionGlobals,
      ),
    );
  }

  return {
    target: ctx.config.baseUrl,
    bridge: summarizeBridge(snap.info),
    state: snap.state?.state ?? "unknown",
    devices: usable.length,
    by_type: byType,
    interview_pending: interviewPending,
    unsupported,
    help,
  };
}
