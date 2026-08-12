import { createServer, type Server } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import type { Z2mBridgeInfo, Z2mDevice } from "../src/types.js";

export function tempHome(): string {
  return mkdtempSync(join(tmpdir(), "z2m-axi-home-"));
}

export const SAMPLE_DEVICES: Z2mDevice[] = [
  {
    ieee_address: "0x00158d00018255df",
    type: "Router",
    network_address: 29159,
    supported: true,
    disabled: false,
    friendly_name: "kitchen_plug",
    description: "plug under sink",
    definition: {
      model: "ZNCZ02LM",
      vendor: "Xiaomi",
      description: "Mi power plug Zigbee",
      exposes: [{ type: "switch" }],
    },
    power_source: "Mains (single phase)",
    model_id: "lumi.plug",
    interview_state: "SUCCESSFUL",
    interview_completed: true,
  },
  {
    ieee_address: "0x90fd9ffffe6494fc",
    type: "Router",
    network_address: 57440,
    supported: true,
    friendly_name: "living_bulb",
    definition: {
      model: "LED1624G9",
      vendor: "IKEA",
      description: "TRADFRI bulb",
    },
    power_source: "Mains (single phase)",
    interview_state: "SUCCESSFUL",
  },
  {
    ieee_address: "0x00124b00120144ae",
    type: "Coordinator",
    network_address: 0,
    supported: false,
    friendly_name: "Coordinator",
    definition: null,
    interview_state: "SUCCESSFUL",
  },
  {
    ieee_address: "0xabcabcabcabcab01",
    type: "EndDevice",
    supported: false,
    friendly_name: "unknown_sensor",
    interview_state: "FAILED",
  },
];

export const SAMPLE_INFO: Z2mBridgeInfo = {
  version: "2.1.0",
  commit: "abc1234",
  coordinator: {
    ieee_address: "0x00124b00120144ae",
    type: "zStack30x",
  },
  network: { channel: 15, pan_id: 5674 },
  log_level: "info",
  permit_join: false,
  restart_required: false,
  zigbee_herdsman: { version: "0.20.0" },
  zigbee_herdsman_converters: { version: "15.98.0" },
  os: { version: "Linux - test", node_version: "v22.0.0" },
  mqtt: { server: "mqtt://localhost:1883", version: 5 },
};

export interface MockZ2mOptions {
  info?: Z2mBridgeInfo;
  devices?: Z2mDevice[];
  authToken?: string;
  /** Delay before pushing bridge/devices after connect (ms). */
  devicesDelayMs?: number;
  /** When false, never push bridge/devices (tests incomplete retained snapshot). */
  pushDevices?: boolean;
  /** Custom request handler; return response data or throw. */
  onRequest?: (
    path: string,
    payload: Record<string, unknown>,
  ) => unknown | Promise<unknown>;
}

export interface MockZ2m {
  baseUrl: string;
  port: number;
  close: () => Promise<void>;
  setInfo: (info: Z2mBridgeInfo) => void;
  setDevices: (devices: Z2mDevice[]) => void;
}

/**
 * Minimal Z2M frontend WebSocket mock: serves /api, pushes retained topics,
 * answers bridge/request/* with bridge/response/*.
 */
export async function startMockZ2m(options: MockZ2mOptions = {}): Promise<MockZ2m> {
  let info = options.info ?? { ...SAMPLE_INFO };
  let devices = options.devices ?? SAMPLE_DEVICES.map((d) => ({ ...d }));
  const authToken = options.authToken;

  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("z2m-mock");
  });

  const wss = new WebSocketServer({ noServer: true, path: "/api" });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/api") {
      socket.destroy();
      return;
    }
    if (authToken && url.searchParams.get("token") !== authToken) {
      // Mirror Z2M: accept upgrade then close with 4401
      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.close(4401, "Unauthorized");
      });
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (ws: WebSocket) => {
    ws.send(JSON.stringify({ topic: "bridge/state", payload: { state: "online" } }));
    ws.send(JSON.stringify({ topic: "bridge/info", payload: info }));
    const shouldPushDevices = options.pushDevices !== false;
    const pushDevices = () => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ topic: "bridge/devices", payload: devices }));
      }
    };
    if (shouldPushDevices) {
      if (options.devicesDelayMs && options.devicesDelayMs > 0) {
        setTimeout(pushDevices, options.devicesDelayMs);
      } else {
        pushDevices();
      }
    }

    ws.on("message", async (data) => {
      let msg: { topic?: string; payload?: unknown };
      try {
        msg = JSON.parse(String(data)) as { topic?: string; payload?: unknown };
      } catch {
        return;
      }
      if (!msg.topic?.startsWith("bridge/request/")) return;

      const path = msg.topic.slice("bridge/request/".length);
      const payload =
        typeof msg.payload === "object" && msg.payload !== null
          ? (msg.payload as Record<string, unknown>)
          : {};
      const transaction =
        typeof payload.transaction === "string" ? payload.transaction : undefined;
      const responseTopic = `bridge/response/${path}`;

      try {
        let dataOut: unknown = {};
        if (options.onRequest) {
          dataOut = await options.onRequest(path, payload);
        } else if (path === "permit_join") {
          const time = Number(payload.time ?? 0);
          info = { ...info, permit_join: time > 0 };
          if (time > 0) {
            info.permit_join_end = Math.floor(Date.now() / 1000) + time;
          } else {
            delete info.permit_join_end;
          }
          dataOut = { time, ...(payload.device ? { device: payload.device } : {}) };
          // push updated info
          ws.send(JSON.stringify({ topic: "bridge/info", payload: info }));
        } else if (path === "device/interview") {
          dataOut = { id: payload.id };
        } else {
          dataOut = {};
        }

        ws.send(
          JSON.stringify({
            topic: responseTopic,
            payload: {
              status: "ok",
              data: dataOut,
              ...(transaction ? { transaction } : {}),
            },
          }),
        );
      } catch (err) {
        ws.send(
          JSON.stringify({
            topic: responseTopic,
            payload: {
              status: "error",
              error: err instanceof Error ? err.message : String(err),
              ...(transaction ? { transaction } : {}),
            },
          }),
        );
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  const port = addr.port;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    port,
    setInfo: (next) => {
      info = next;
    },
    setDevices: (next) => {
      devices = next;
    },
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        for (const c of wss.clients) c.terminate();
        wss.close();
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

/** Capture main() stdout as string. */
export async function runCli(
  argv: string[],
  options: {
    homeDir?: string;
    env?: NodeJS.ProcessEnv;
    clientOptions?: Omit<import("../src/client.js").Z2mClientOptions, "config">;
  } = {},
): Promise<{ stdout: string; exitCode: number }> {
  const chunks: string[] = [];
  const previousExitCode = process.exitCode;
  process.exitCode = 0;

  const { main } = await import("../src/cli.js");
  try {
    await main({
      argv,
      stdout: { write: (c) => chunks.push(String(c)) },
      homeDir: options.homeDir,
      env: options.env ?? {},
      clientOptions: options.clientOptions,
    });
  } finally {
    // runAxiCli sets process.exitCode on errors (does not call process.exit).
  }
  const exitCode = typeof process.exitCode === "number" ? process.exitCode : 0;
  process.exitCode = previousExitCode;
  return { stdout: chunks.join(""), exitCode };
}
