import { AxiError } from "axi-sdk-js";
import {
  assertNoUnknownFlags,
  parseNonNegativeIntegerFlag,
  takeBoolFlag,
  takeFirstPositional,
  takeFlag,
  takePositional,
} from "../args.js";
import { assertResponseOk, withClient } from "../client.js";
import { requireConfirmation } from "../confirm.js";
import type { CliContext } from "../context.js";
import { withGlobals } from "../context.js";
import {
  DEFAULT_DEVICE_LIMIT,
  deviceRow,
  filterDevices,
  findDevice,
  sortDevices,
  truncate,
  type DeviceRow,
} from "../format.js";
import type { Output } from "../output.js";
import type { Z2mDevice } from "../types.js";

export const DEVICE_HELP = `usage: z2m-axi device <subcommand>
subcommands[3]:
  list                 List paired Zigbee devices
  show <id>            Show one device (ieee address or friendly_name)
  interview <id>       Re-interview a device (mutation; requires confirmation)
flags for list[7]:
  --type <type>, --search <q>, --limit <n>, --fields <a,b,c>, --include-coordinator
  --url <url>, --token <token>, --timeout <ms>, --config <path>
flags for show[5]:
  --full, --url, --token, --timeout, --config
flags for interview[5]:
  --confirm <token>, --url, --token, --timeout, --config
  Confirmation token is the device ieee or friendly_name you passed as <id>.
examples:
  z2m-axi device list
  z2m-axi device list --type Router --search kitchen
  z2m-axi device show 0x00158d00018255df
  z2m-axi device interview my_plug --confirm my_plug
`;

const DEVICE_VALUE_FLAGS = [
  "--type",
  "--search",
  "--limit",
  "--fields",
  "--confirm",
  "--url",
  "--token",
  "--timeout",
  "--config",
];

export async function deviceCommand(
  args: string[],
  ctx: CliContext,
): Promise<Output> {
  // Strip only the first true positional subcommand; keep flags on either side.
  const working = [...args];
  const sub = takeFirstPositional(working, DEVICE_VALUE_FLAGS);
  if (!sub) {
    throw new AxiError("device subcommand required", "VALIDATION_ERROR", [
      "valid subcommands: list, show, interview",
      "Run `z2m-axi device --help`",
    ]);
  }

  if (sub === "list") return deviceList(working, ctx);
  if (sub === "show") return deviceShow(working, ctx);
  if (sub === "interview") return deviceInterview(working, ctx);

  throw new AxiError(`unknown device subcommand: ${sub}`, "VALIDATION_ERROR", [
    "valid subcommands: list, show, interview",
    "Run `z2m-axi device --help`",
  ]);
}

async function deviceList(
  args: string[],
  ctx: CliContext,
): Promise<Output> {
  const working = [...args];
  const type = takeFlag(working, "--type");
  const search = takeFlag(working, "--search");
  const fieldsRaw = takeFlag(working, "--fields");
  const limitRaw = takeFlag(working, "--limit");
  const includeCoordinator = takeBoolFlag(working, "--include-coordinator");
  // globals may still be present if not stripped — ignore known globals
  takeFlag(working, "--url");
  takeFlag(working, "--token");
  takeFlag(working, "--timeout");
  takeFlag(working, "--config");
  assertNoUnknownFlags(working, [
    "--type",
    "--search",
    "--fields",
    "--limit",
    "--include-coordinator",
    "--url",
    "--token",
    "--timeout",
    "--config",
  ]);
  if (takePositional(working).length > 0) {
    throw new AxiError("device list takes no positional arguments", "VALIDATION_ERROR", [
      "Run `z2m-axi device list --help`",
    ]);
  }

  const limit = parseNonNegativeIntegerFlag("--limit", limitRaw, DEFAULT_DEVICE_LIMIT);
  if (limit < 1) {
    throw new AxiError("--limit must be >= 1", "VALIDATION_ERROR");
  }

  const snap = await withClient(
    ctx.config,
    (c) => c.ensureSnapshot(),
    ctx.clientOptions,
  );
  const all = sortDevices(
    filterDevices(snap.devices ?? [], { type, search, includeCoordinator }),
  );
  const total = all.length;
  const page = all.slice(0, limit);
  const rows = page.map(deviceRow);

  const defaultFields = ["ieee", "name", "type", "model", "interview"] as const;
  const extraAllowed = [
    "vendor",
    "supported",
    "power",
    "description",
  ] as const;
  let fields: string[] = [...defaultFields];
  if (fieldsRaw) {
    const requested = fieldsRaw.split(",").map((s) => s.trim()).filter(Boolean);
    const allowed = new Set<string>([...defaultFields, ...extraAllowed]);
    for (const f of requested) {
      if (!allowed.has(f)) {
        throw new AxiError(`unknown field: ${f}`, "VALIDATION_ERROR", [
          `valid fields: ${[...allowed].join(", ")}`,
        ]);
      }
    }
    fields = requested;
  }

  const projected = rows.map((r) => {
    const o: Record<string, string> = {};
    const record = r as unknown as Record<keyof DeviceRow, string>;
    for (const f of fields) o[f] = record[f as keyof DeviceRow] ?? "";
    return o;
  });

  if (total === 0) {
    return {
      count: "0 devices found",
      target: ctx.config.baseUrl,
      help: [
        withGlobals("z2m-axi bridge info", ctx.suggestionGlobals),
        withGlobals(
          "z2m-axi permit-join on --time 254 --confirm permit-join",
          ctx.suggestionGlobals,
        ),
      ],
    };
  }

  const out: Output = {
    count: `${page.length} of ${total} total`,
    target: ctx.config.baseUrl,
    devices: projected,
  };

  const help: string[] = [
    withGlobals("z2m-axi device show <ieee|friendly_name>", ctx.suggestionGlobals),
  ];
  if (total > page.length) {
    help.unshift(
      withGlobals(
        `z2m-axi device list --limit ${total}`,
        ctx.suggestionGlobals,
      ),
    );
  }
  out.help = help;
  return out;
}

async function deviceShow(
  args: string[],
  ctx: CliContext,
): Promise<Output> {
  const working = [...args];
  const full = takeBoolFlag(working, "--full");
  takeFlag(working, "--url");
  takeFlag(working, "--token");
  takeFlag(working, "--timeout");
  takeFlag(working, "--config");
  assertNoUnknownFlags(working, [
    "--full",
    "--url",
    "--token",
    "--timeout",
    "--config",
  ]);
  const positionals = takePositional(working);
  const id = positionals[0];
  if (!id || positionals.length !== 1) {
    throw new AxiError("device show requires exactly one <id>", "VALIDATION_ERROR", [
      "Run `z2m-axi device show <ieee|friendly_name>`",
    ]);
  }

  const snap = await withClient(
    ctx.config,
    (c) => c.ensureSnapshot(),
    ctx.clientOptions,
  );
  const devices = snap.devices ?? [];
  const device = findDevice(devices, id);
  if (!device) {
    throw new AxiError(`device not found: ${id}`, "NOT_FOUND", [
      withGlobals("z2m-axi device list", ctx.suggestionGlobals),
    ]);
  }

  return formatDeviceDetail(device, full, ctx);
}

function formatDeviceDetail(
  d: Z2mDevice,
  full: boolean,
  ctx: CliContext,
): Output {
  const row = deviceRow(d);
  const out: Output = {
    ieee: row.ieee,
    name: row.name,
    type: row.type,
    vendor: row.vendor,
    model: row.model,
    interview: row.interview,
    supported: row.supported,
    power: row.power,
  };
  if (row.description) {
    if (full) {
      out.description = row.description;
    } else {
      const t = truncate(row.description, 500);
      out.description = t.truncated
        ? `${t.text}... (${t.total} chars total)`
        : t.text;
      if (t.truncated) {
        out.help = [
          withGlobals(
            `z2m-axi device show ${row.name} --full`,
            ctx.suggestionGlobals,
          ),
        ];
      }
    }
  }
  if (d.network_address !== undefined) out.network_address = d.network_address;
  if (d.software_build_id) out.software_build_id = d.software_build_id;
  if (d.date_code) out.date_code = d.date_code;
  if (d.definition?.description) {
    out.product = d.definition.description;
  }
  if (full && d.definition?.exposes) {
    out.exposes_count = Array.isArray(d.definition.exposes)
      ? d.definition.exposes.length
      : 0;
  }
  if (!out.help) {
    out.help = [
      withGlobals(
        `z2m-axi device interview ${row.name} --confirm ${row.name}`,
        ctx.suggestionGlobals,
      ),
    ];
  }
  return out;
}

async function deviceInterview(
  args: string[],
  ctx: CliContext,
): Promise<Output> {
  const working = [...args];
  const confirmFlag = takeFlag(working, "--confirm");
  takeFlag(working, "--url");
  takeFlag(working, "--token");
  takeFlag(working, "--timeout");
  takeFlag(working, "--config");
  assertNoUnknownFlags(working, [
    "--confirm",
    "--url",
    "--token",
    "--timeout",
    "--config",
  ]);
  const positionals = takePositional(working);
  const id = positionals[0];
  if (!id || positionals.length !== 1) {
    throw new AxiError(
      "device interview requires exactly one <id>",
      "VALIDATION_ERROR",
      ["Run `z2m-axi device interview <ieee|friendly_name> --confirm <id>`"],
    );
  }

  // Resolve device first so confirmation token can be the canonical name.
  const snap = await withClient(
    ctx.config,
    (c) => c.ensureSnapshot(),
    ctx.clientOptions,
  );
  const device = findDevice(snap.devices ?? [], id);
  if (!device) {
    throw new AxiError(`device not found: ${id}`, "NOT_FOUND", [
      withGlobals("z2m-axi device list", ctx.suggestionGlobals),
    ]);
  }
  const confirmToken = id;

  await requireConfirmation({
    token: confirmToken,
    summary: `re-interview device ${device.friendly_name ?? device.ieee_address} (${device.ieee_address})`,
    confirmFlag,
  });

  const data = await withClient(
    ctx.config,
    async (c) => {
      const response = await c.request("bridge/request/device/interview", {
        id: device.ieee_address,
      });
      return assertResponseOk(response, "device interview");
    },
    ctx.clientOptions,
  );

  return {
    ok: `interview started for ${device.friendly_name ?? device.ieee_address}`,
    ieee: device.ieee_address,
    name: device.friendly_name ?? device.ieee_address,
    response: data ?? {},
    help: [
      withGlobals(
        `z2m-axi device show ${device.friendly_name ?? device.ieee_address}`,
        ctx.suggestionGlobals,
      ),
    ],
  };
}
