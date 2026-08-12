/**
 * Generate skills/z2m-axi/SKILL.md from the CLI's static help surface.
 * Run via `npm run build:skill`. Fails if committed skill is stale when --check.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const outPath = join(root, "skills", "z2m-axi", "SKILL.md");

const skill = `---
name: z2m-axi
description: >
  Control Zigbee2MQTT through the z2m-axi CLI - list and inspect devices, read bridge
  info, and run confirmed mesh admin actions (permit-join, interview) via the official
  frontend WebSocket API. Use whenever a task touches Zigbee2MQTT: device inventory,
  pairing window, re-interview, or bridge status.
user-invocable: false
---

# z2m-axi

Agent ergonomic CLI for Zigbee2MQTT via the official frontend WebSocket API.

You do not need z2m-axi installed globally - invoke it with \`npx -y z2m-axi <command>\`.
If output shows a follow-up starting with \`z2m-axi\`, run it as \`npx -y z2m-axi ...\` instead.

## When to use

Use z2m-axi for Zigbee2MQTT admin from an agent session: device list/detail, bridge
version and permit-join state, opening/closing the join window, and re-interviewing a
device. Prefer this over driving the Z2M browser UI or raw MQTT for those tasks.

## Setup

Config file: \`~/.config/z2m-axi/config.json\` (mode 0600).

\`\`\`sh
npx -y z2m-axi config set --url http://HOST:8080
# optional if frontend.auth_token is set:
npx -y z2m-axi config set --token "$Z2M_TOKEN"
\`\`\`

Env overrides: \`Z2M_URL\`, \`Z2M_TOKEN\`, \`Z2M_TIMEOUT_MS\`.
Flags: \`--url\`, \`--token\`, \`--timeout\`, \`--config\`.
Auth tokens are never printed in full (\`config show\` masks them).

Transport: official Z2M **frontend WebSocket** at \`ws(s)://host:port/api\` (same protocol
as the Z2M UI). Not a third-party REST shim.

## Workflow

1. \`npx -y z2m-axi\` — dashboard: bridge summary, device counts, permit-join state.
2. \`device list\` / \`device show <ieee|friendly_name>\` — inventory and detail.
3. \`bridge info\` — version, channel, coordinator, permit-join.
4. Mutations require confirmation:
   - Interactive TTY: type the confirmation token when prompted.
   - Agents/non-TTY: pass \`--confirm <token>\`.
   - Tokens: \`permit-join\` / \`permit-join-off\` / the device id for interview.
5. Optional ambient context: \`npx -y z2m-axi setup hooks\`.

## Commands

\`\`\`
commands[6]:
  (none)=dashboard, device, bridge, permit-join, config, setup
\`\`\`

| Command | Purpose |
|---|---|
| \`device list\` | List devices (default fields: ieee, name, type, model, interview) |
| \`device show <id>\` | Device detail; \`--full\` for untruncated description |
| \`device interview <id> --confirm <id>\` | Re-interview (mutation) |
| \`bridge info\` | Bridge / network summary |
| \`permit-join on\\|off --confirm …\` | Open/close join window (mutation) |
| \`config show\\|set\` | Local connection settings |
| \`setup hooks\` | SessionStart hooks |

Run \`npx -y z2m-axi --help\` or \`npx -y z2m-axi <command> --help\` for flags.

## Tips

- Output is TOON (token-efficient). Lists default to a small field set; add columns with \`--fields\`.
- Mutations are gated — never pass \`--confirm\` casually; match the required token exactly.
- Do not log or commit \`authToken\` / \`Z2M_TOKEN\`.
- Prefer ieee or stable friendly_name as device ids.
`;

const check = process.argv.includes("--check");

if (check) {
  let existing = "";
  try {
    existing = readFileSync(outPath, "utf8");
  } catch {
    console.error("SKILL.md missing — run npm run build:skill");
    process.exit(1);
  }
  if (existing !== skill) {
    console.error("SKILL.md is stale — run npm run build:skill");
    process.exit(1);
  }
  console.log("SKILL.md up to date");
  process.exit(0);
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, skill);
console.log(`wrote ${outPath}`);
