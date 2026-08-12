/** Minimal shapes from Zigbee2MQTT bridge MQTT/WS topics. */

export interface Z2mCoordinator {
  ieee_address?: string;
  type?: string;
  meta?: Record<string, unknown>;
}

export interface Z2mNetwork {
  channel?: number;
  pan_id?: number;
  extended_pan_id?: unknown;
}

export interface Z2mBridgeInfo {
  version?: string;
  commit?: string;
  coordinator?: Z2mCoordinator;
  network?: Z2mNetwork;
  log_level?: string;
  permit_join?: boolean;
  permit_join_end?: number;
  restart_required?: boolean;
  zigbee_herdsman?: { version?: string };
  zigbee_herdsman_converters?: { version?: string };
  os?: {
    version?: string;
    node_version?: string;
    cpus?: string;
    memory_mb?: number;
  };
  mqtt?: {
    server?: string;
    version?: number;
  };
  config?: Record<string, unknown>;
}

export interface Z2mDeviceDefinition {
  model?: string;
  vendor?: string;
  description?: string;
  source?: string;
  exposes?: unknown[];
  options?: unknown[];
}

export interface Z2mDevice {
  ieee_address: string;
  type?: string;
  network_address?: number;
  supported?: boolean;
  disabled?: boolean;
  friendly_name?: string;
  description?: string;
  definition?: Z2mDeviceDefinition | null;
  power_source?: string | null;
  model_id?: string | null;
  interview_state?: string;
  interviewing?: boolean;
  interview_completed?: boolean;
  date_code?: string | null;
  software_build_id?: string;
  endpoints?: Record<string, unknown>;
}

export interface Z2mBridgeState {
  state?: string;
}

export interface Z2mResponsePayload {
  status: "ok" | "error";
  data?: unknown;
  error?: string;
  transaction?: string;
}

export interface Snapshot {
  info?: Z2mBridgeInfo;
  devices?: Z2mDevice[];
  state?: Z2mBridgeState;
  receivedAt: number;
}
