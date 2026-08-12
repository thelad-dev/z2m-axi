# z2m-axi

Agent eXperience Interface (AXI) CLI for [Zigbee2MQTT](https://www.zigbee2mqtt.io/).

Token-efficient [TOON](https://toonformat.dev/) output over the **official Z2M frontend WebSocket API** (`ws://host:8080/api`) — the same protocol the Z2M UI uses. List devices, read bridge info, and run mesh-admin mutations only with explicit confirmation.

## Install

```sh
npm install -g z2m-axi
```

Or without installing:

```sh
npx -y z2m-axi <command>
```

Requires Node.js 20+.

## Configure

Local config (created on first `config set`), mode `0600`:

```sh
z2m-axi config set --url http://192.168.1.10:8080
```

If Zigbee2MQTT has `frontend.auth_token` set:

```sh
z2m-axi config set --token "$Z2M_TOKEN"
```

| Source | Base URL | Auth token | Timeout |
|---|---|---|---|
| Default | `http://localhost:8080` | (none) | 10000 ms |
| Config file | `~/.config/z2m-axi/config.json` → `baseUrl` | `authToken` | `timeoutMs` |
| Environment | `Z2M_URL` | `Z2M_TOKEN` | `Z2M_TIMEOUT_MS` |
| Flags | `--url` | `--token` | `--timeout` |

Alternate config path: `--config <path>` (or leave the default `~/.config/z2m-axi/config.json`).

Priority: flag > env > config file > default.

**Secrets:** `config show` masks tokens. Tokens are never written to stdout in full. Do not commit config files that contain `authToken`. Clear a stored token with `z2m-axi config set --clear-token`.

### Auth (Zigbee2MQTT)

z2m-axi talks to the **frontend** HTTP(S) port (default `8080`), not MQTT directly.

1. Frontend must be enabled in Z2M (`frontend.enabled: true`).
2. Optional: set `frontend.auth_token` in Z2M; pass the same value as `--token` / `Z2M_TOKEN` / config `authToken`.
3. WebSocket path: `{baseUrl}/api` (e.g. `ws://host:8080/api?token=…`).

See [Z2M frontend configuration](https://www.zigbee2mqtt.io/guide/configuration/frontend.html) and [MQTT topics](https://www.zigbee2mqtt.io/guide/usage/mqtt_topics_and_messages.html) (bridge request/response schema).

## Usage

```sh
$ z2m-axi
bin: ~/.local/bin/z2m-axi
description: Agent ergonomic CLI for Zigbee2MQTT …
target: http://192.168.1.10:8080
bridge:
  version: 2.x.x
  permit_join: false
  channel: 15
devices: 24
…

$ z2m-axi device list
count: 24 of 24 total
devices[24]{ieee,name,type,model,interview}:
  0x0015…,kitchen_plug,Router,ZNCZ02LM,SUCCESSFUL
  …

$ z2m-axi device show kitchen_plug
ieee: 0x00158d…
name: kitchen_plug
type: Router
…

$ z2m-axi bridge info
version: 2.x.x
permit_join: false
coordinator: zStack30x
channel: 15
…
```

### Mutations (confirmation required)

Opening the network or re-interviewing a device changes mesh state. Every mutation needs confirmation:

| Mode | How |
|---|---|
| Interactive TTY | Prompt asks you to type the confirmation token |
| Agent / non-TTY | Pass `--confirm <token>` |

| Command | Token |
|---|---|
| `permit-join on …` | `permit-join` |
| `permit-join off` | `permit-join-off` |
| `device interview <id>` | the same `<id>` you passed |

```sh
z2m-axi permit-join on --time 120 --confirm permit-join
z2m-axi permit-join off --confirm permit-join-off
z2m-axi device interview kitchen_plug --confirm kitchen_plug
```

## Commands

| Command | Description |
|---|---|
| `(none)` | Home dashboard |
| `device list` | List devices (`--type`, `--search`, `--limit`, `--fields`, `--include-coordinator`) |
| `device show <id>` | Device detail (`--full`) |
| `device interview <id>` | Re-interview (mutation) |
| `bridge info` | Bridge / network info |
| `permit-join on\|off` | Permit join window (mutation; `--time` 1–254, default 254; optional `--device <id>`) |
| `config show\|set` | Local connection config (`set`: `--url`, `--token`, `--clear-token`, `--timeout`) |
| `setup hooks` | Install agent SessionStart hooks |
| `update` | Self-update (via axi-sdk-js) |

```sh
z2m-axi --help
z2m-axi device --help
```

## Agent integration

```sh
z2m-axi setup hooks
# and/or
npx skills add thelad-dev/z2m-axi --skill z2m-axi
```

## Development

```sh
npm install
npm test
npm run build
npm run dev -- device list --url http://localhost:8080
```

## License

[MIT](LICENSE)
