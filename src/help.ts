export const DESCRIPTION =
  "Agent ergonomic CLI for Zigbee2MQTT via the official frontend WebSocket API. List devices, read bridge info, and run confirmed mesh admin actions.";

export const TOP_LEVEL_HELP = `usage: z2m-axi [command] [args] [flags]
commands[6]:
  (none)=dashboard, device, bridge, permit-join, config, setup
global flags (after command)[4]:
  --url <url>       Frontend base URL (default http://localhost:8080; env Z2M_URL)
  --token <token>   Frontend auth_token (env Z2M_TOKEN; never printed)
  --timeout <ms>    Request timeout (env Z2M_TIMEOUT_MS)
  --config <path>   Config file path (default ~/.config/z2m-axi/config.json)
  --help, -v/-V/--version
examples:
  z2m-axi
  z2m-axi device list
  z2m-axi device show kitchen_plug
  z2m-axi bridge info
  z2m-axi permit-join on --time 120 --confirm permit-join
  z2m-axi config set --url http://192.168.1.10:8080
  z2m-axi setup hooks
`;

export { BRIDGE_HELP } from "./commands/bridge.js";
export { CONFIG_HELP } from "./commands/config.js";
export { DEVICE_HELP } from "./commands/device.js";
export { PERMIT_JOIN_HELP } from "./commands/permit-join.js";
export { SETUP_HELP } from "./commands/setup.js";
