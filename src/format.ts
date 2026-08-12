import type { Z2mBridgeInfo, Z2mDevice } from "./types.js";

export const DEFAULT_DEVICE_LIMIT = 100;

export interface DeviceRow {
  ieee: string;
  name: string;
  type: string;
  vendor: string;
  model: string;
  interview: string;
  supported: string;
  power: string;
  description: string;
}

export function deviceRow(d: Z2mDevice): DeviceRow {
  return {
    ieee: d.ieee_address,
    name: d.friendly_name ?? d.ieee_address,
    type: d.type ?? "",
    vendor: d.definition?.vendor ?? "",
    model: d.definition?.model ?? d.model_id ?? "",
    interview: d.interview_state ?? (d.interview_completed ? "SUCCESSFUL" : ""),
    supported: d.supported === undefined ? "" : d.supported ? "yes" : "no",
    power: d.power_source ?? "",
    description: d.description ?? "",
  };
}

export function findDevice(
  devices: Z2mDevice[],
  id: string,
): Z2mDevice | undefined {
  const needle = id.trim();
  const lower = needle.toLowerCase();
  return devices.find(
    (d) =>
      d.ieee_address === needle ||
      d.ieee_address?.toLowerCase() === lower ||
      d.friendly_name === needle ||
      d.friendly_name?.toLowerCase() === lower,
  );
}

export function summarizeBridge(info: Z2mBridgeInfo | undefined): Record<string, unknown> {
  if (!info) {
    return { bridge: "unavailable (no bridge/info yet)" };
  }
  const out: Record<string, unknown> = {
    version: info.version ?? "",
    permit_join: info.permit_join === true,
  };
  if (info.permit_join && info.permit_join_end) {
    out.permit_join_end = info.permit_join_end;
  }
  if (info.coordinator?.type) out.coordinator = info.coordinator.type;
  if (info.coordinator?.ieee_address) out.coordinator_ieee = info.coordinator.ieee_address;
  if (info.network?.channel !== undefined) out.channel = info.network.channel;
  if (info.network?.pan_id !== undefined) out.pan_id = info.network.pan_id;
  if (info.restart_required) out.restart_required = true;
  if (info.commit) out.commit = info.commit;
  return out;
}

export function filterDevices(
  devices: Z2mDevice[],
  options: { type?: string; search?: string; includeCoordinator?: boolean } = {},
): Z2mDevice[] {
  let list = devices;
  if (!options.includeCoordinator) {
    list = list.filter((d) => d.type !== "Coordinator");
  }
  if (options.type) {
    const t = options.type.toLowerCase();
    list = list.filter((d) => (d.type ?? "").toLowerCase() === t);
  }
  if (options.search) {
    const q = options.search.toLowerCase();
    list = list.filter((d) => {
      const hay = [
        d.friendly_name,
        d.ieee_address,
        d.description,
        d.definition?.vendor,
        d.definition?.model,
        d.model_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }
  return list;
}

export function sortDevices(devices: Z2mDevice[]): Z2mDevice[] {
  return [...devices].sort((a, b) => {
    const an = (a.friendly_name ?? a.ieee_address).toLowerCase();
    const bn = (b.friendly_name ?? b.ieee_address).toLowerCase();
    return an.localeCompare(bn);
  });
}

export function truncate(text: string, max = 500): { text: string; truncated: boolean; total: number } {
  if (text.length <= max) return { text, truncated: false, total: text.length };
  return { text: text.slice(0, max), truncated: true, total: text.length };
}
