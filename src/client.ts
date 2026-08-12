import { AxiError } from "axi-sdk-js";
import { buildWsUrl, type ResolvedConfig } from "./config.js";
import type {
  Snapshot,
  Z2mBridgeInfo,
  Z2mBridgeState,
  Z2mDevice,
  Z2mResponsePayload,
} from "./types.js";

export interface Z2mMessage {
  topic: string;
  payload: unknown;
}

export interface Z2mClientOptions {
  config: ResolvedConfig;
  /** Injected WebSocket constructor (tests). */
  WebSocketImpl?: typeof WebSocket;
  /** Override settle wait after connect for retained topics (ms). */
  settleMs?: number;
}

type Pending = {
  resolve: (value: Z2mResponsePayload) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * Zigbee2MQTT frontend WebSocket client.
 *
 * Protocol (official frontend):
 * - Connect to ws(s)://host:port/api[?token=...]
 * - Server pushes retained bridge topics on connect
 * - Client sends { topic, payload }; bridge/request/* includes transaction
 * - Responses arrive on bridge/response/* with matching transaction
 */
export class Z2mClient {
  private readonly config: ResolvedConfig;
  private readonly WebSocketImpl: typeof WebSocket;
  private readonly settleMs: number;
  private ws: WebSocket | null = null;
  private readonly pending = new Map<string, Pending>();
  private readonly retained = new Map<string, unknown>();
  private txnCounter = 1;
  private readonly txnPrefix = `z2m-axi-${Math.random().toString(36).slice(2, 8)}`;
  private openPromise: Promise<void> | null = null;

  constructor(options: Z2mClientOptions) {
    this.config = options.config;
    this.WebSocketImpl = options.WebSocketImpl ?? WebSocket;
    this.settleMs = options.settleMs ?? 250;
  }

  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.openPromise) return this.openPromise;

    this.openPromise = new Promise<void>((resolve, reject) => {
      const url = buildWsUrl(this.config.baseUrl, this.config.authToken);
      let settled = false;
      let settleTimer: ReturnType<typeof setTimeout> | undefined;
      const timeout = setTimeout(() => {
        fail(
          new AxiError(
            `timed out connecting to Zigbee2MQTT frontend at ${this.config.baseUrl}`,
            "CONNECT_TIMEOUT",
            [
              "Check that the Z2M frontend is running and reachable",
              "Set URL with `z2m-axi config set --url http://host:8080` or Z2M_URL",
              "If frontend.auth_token is set, pass --token or Z2M_TOKEN / config authToken",
            ],
          ),
        );
      }, this.config.timeoutMs);

      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (settleTimer) clearTimeout(settleTimer);
        try {
          this.ws?.close();
        } catch {
          // ignore
        }
        this.ws = null;
        this.openPromise = null;
        reject(err);
      };

      const succeed = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (settleTimer) clearTimeout(settleTimer);
        resolve();
      };

      try {
        this.ws = new this.WebSocketImpl(url);
      } catch (err) {
        fail(
          new AxiError(
            `failed to open WebSocket: ${err instanceof Error ? err.message : String(err)}`,
            "CONNECT_ERROR",
            ["Check base URL and that the frontend exposes /api"],
          ),
        );
        return;
      }

      this.ws.addEventListener("open", () => {
        // Wait briefly for retained bridge topics pushed on connect.
        settleTimer = setTimeout(() => succeed(), this.settleMs);
      });

      this.ws.addEventListener("message", (event) => {
        this.onMessage(String(event.data));
        // Early settle once we have the critical retained topics.
        if (this.retained.has("bridge/info") && this.retained.has("bridge/devices")) {
          succeed();
        }
      });

      this.ws.addEventListener("error", () => {
        fail(
          new AxiError(
            `WebSocket error talking to ${this.config.baseUrl}`,
            "CONNECT_ERROR",
            [
              "Verify Z2M frontend is up (default port 8080)",
              "Check auth token if frontend.auth_token is configured",
              "Run `z2m-axi config show` to inspect connection settings (token masked)",
            ],
          ),
        );
      });

      this.ws.addEventListener("close", (event) => {
        const code = event.code;
        if (code === 4401) {
          fail(
            new AxiError("unauthorized (frontend auth_token rejected)", "AUTH_ERROR", [
              "Set token via `z2m-axi config set --token <token>` or Z2M_TOKEN",
              "Token is Z2M frontend.auth_token — never commit it",
            ]),
          );
          return;
        }
        if (!settled) {
          fail(
            new AxiError(
              `WebSocket closed before ready (code ${code})`,
              "CONNECT_ERROR",
              ["Check base URL and frontend auth settings"],
            ),
          );
          return;
        }
        // Reject in-flight requests on unexpected close after open.
        for (const [txn, p] of this.pending) {
          clearTimeout(p.timer);
          p.reject(
            new AxiError("connection closed while waiting for response", "REQUEST_ERROR"),
          );
          this.pending.delete(txn);
        }
        this.ws = null;
        this.openPromise = null;
      });
    });

    return this.openPromise;
  }

  close(): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new AxiError("client closed", "REQUEST_ERROR"));
    }
    this.pending.clear();
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
    this.ws = null;
    this.openPromise = null;
  }

  private onMessage(raw: string): void {
    let msg: Z2mMessage;
    try {
      msg = JSON.parse(raw) as Z2mMessage;
    } catch {
      return;
    }
    if (!msg || typeof msg.topic !== "string") return;

    this.retained.set(msg.topic, msg.payload);

    if (msg.topic.startsWith("bridge/response/")) {
      const payload = msg.payload as Z2mResponsePayload;
      const txn = payload?.transaction;
      if (txn && this.pending.has(txn)) {
        const p = this.pending.get(txn)!;
        clearTimeout(p.timer);
        this.pending.delete(txn);
        p.resolve(payload);
      }
    }
  }

  getSnapshot(): Snapshot {
    const info = this.retained.get("bridge/info") as Z2mBridgeInfo | undefined;
    const devices = this.retained.get("bridge/devices") as Z2mDevice[] | undefined;
    const state = this.retained.get("bridge/state") as Z2mBridgeState | undefined;
    return {
      info,
      devices: Array.isArray(devices) ? devices : undefined,
      state,
      receivedAt: Date.now(),
    };
  }

  async ensureSnapshot(): Promise<Snapshot> {
    await this.connect();
    const snap = this.getSnapshot();
    if (!snap.info && !snap.devices) {
      // One more short wait in case settle was early.
      await sleep(this.settleMs);
    }
    return this.getSnapshot();
  }

  async request(
    topic: string,
    payload: Record<string, unknown> | string = {},
  ): Promise<Z2mResponsePayload> {
    await this.connect();
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new AxiError("not connected", "CONNECT_ERROR");
    }

    if (!topic.startsWith("bridge/request/")) {
      throw new AxiError(`invalid request topic: ${topic}`, "VALIDATION_ERROR");
    }

    const transaction = `${this.txnPrefix}-${this.txnCounter++}`;
    const body =
      typeof payload === "string"
        ? payload
        : { ...payload, transaction };

    const message =
      typeof body === "string"
        ? JSON.stringify({ topic, payload: body })
        : JSON.stringify({ topic, payload: body });

    return new Promise<Z2mResponsePayload>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(transaction);
        reject(
          new AxiError(
            `timed out waiting for response to ${topic}`,
            "REQUEST_TIMEOUT",
            ["Increase timeout with Z2M_TIMEOUT_MS or config timeoutMs"],
          ),
        );
      }, this.config.timeoutMs);

      this.pending.set(transaction, { resolve, reject, timer });
      try {
        this.ws!.send(message);
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(transaction);
        reject(
          new AxiError(
            `failed to send request: ${err instanceof Error ? err.message : String(err)}`,
            "REQUEST_ERROR",
          ),
        );
      }
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Shared helper: run with client and always close. */
export async function withClient<T>(
  config: ResolvedConfig,
  fn: (client: Z2mClient) => Promise<T>,
  clientOptions?: Omit<Z2mClientOptions, "config">,
): Promise<T> {
  const client = new Z2mClient({ config, ...clientOptions });
  try {
    return await fn(client);
  } finally {
    client.close();
  }
}

export function assertResponseOk(
  response: Z2mResponsePayload,
  action: string,
): unknown {
  if (response.status === "ok") return response.data;
  const errMsg = response.error ?? "unknown error";
  // Never echo secrets that might appear in error strings from misconfigured proxies.
  const safe = redactSecrets(errMsg);
  throw new AxiError(`${action} failed: ${safe}`, "Z2M_ERROR", [
    "Inspect bridge logs in the Z2M frontend",
  ]);
}

function redactSecrets(message: string): string {
  return message
    .replace(/(token|password|passwd|secret|auth)(=|:)\s*([^\s,;]+)/gi, "$1$2***")
    .replace(/Bearer\s+\S+/gi, "Bearer ***");
}
