# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

## Stack

- Node ESM TypeScript CLI, `axi-sdk-js` + TOON output. Binary: `z2m-axi` (`src/bin/z2m-axi.ts` → `dist/bin/z2m-axi.js`).
- Transport: official Zigbee2MQTT **frontend WebSocket** (`ws(s)://host:port/api`), same protocol as the Z2M UI — not MQTT and not a REST `/api`.
- Config: `~/.config/z2m-axi/config.json` (mode 0600). Env: `Z2M_URL`, `Z2M_TOKEN`, `Z2M_TIMEOUT_MS`. Never print auth tokens in full (`maskSecret` in `src/config.ts`).

## Commands / mutations

- Reads: home, `device list|show`, `bridge info`, `config show`.
- Mutations (`permit-join`, `device interview`) require confirmation via TTY prompt or `--confirm <token>` (`src/confirm.ts`). Tokens: `permit-join`, `permit-join-off`, or the device id for interview.
- `config set` owns `--url`/`--token`/`--timeout`; connection globals must not strip those flags (see `consumeConnectionFlags` in `src/context.ts` / `src/cli.ts`).

## Dev

```sh
npm install
npm test
npm run build   # tsc + skills/z2m-axi/SKILL.md
```

Tests spin a local mock frontend WebSocket (`test/helpers.ts` + `ws`). `runAxiCli` sets `process.exitCode` on errors (does not call `process.exit`).

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
