import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AxiError } from "axi-sdk-js";

export const DEFAULT_BASE_URL = "http://localhost:8080";
export const DEFAULT_TIMEOUT_MS = 10_000;
export const CONFIG_DIR_NAME = "z2m-axi";
export const CONFIG_FILE_NAME = "config.json";

export interface Z2mConfigFile {
  /** Zigbee2MQTT frontend base URL (http/https). Default http://localhost:8080 */
  baseUrl?: string;
  /**
   * Optional frontend auth_token (Z2M `frontend.auth_token`).
   * Never printed in full by config show.
   */
  authToken?: string;
  /** WebSocket connect + request timeout in ms. */
  timeoutMs?: number;
}

export interface ResolvedConfig {
  baseUrl: string;
  authToken: string | undefined;
  timeoutMs: number;
  configPath: string;
  sources: {
    baseUrl: "default" | "config" | "env" | "flag";
    authToken: "none" | "config" | "env" | "flag";
    timeoutMs: "default" | "config" | "env" | "flag";
  };
}

export function defaultConfigDir(home = homedir()): string {
  return join(home, ".config", CONFIG_DIR_NAME);
}

export function defaultConfigPath(home = homedir()): string {
  return join(defaultConfigDir(home), CONFIG_FILE_NAME);
}

export function maskSecret(value: string | undefined): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}…${value.slice(-2)} (${value.length} chars)`;
}

export function loadConfigFile(path: string): Z2mConfigFile {
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new AxiError(`invalid config file (expected object): ${path}`, "CONFIG_ERROR", [
        "Run `z2m-axi config set --url http://host:8080` to rewrite config",
      ]);
    }
    const obj = parsed as Record<string, unknown>;
    const out: Z2mConfigFile = {};
    if (typeof obj.baseUrl === "string") out.baseUrl = obj.baseUrl;
    if (typeof obj.authToken === "string") out.authToken = obj.authToken;
    if (typeof obj.timeoutMs === "number" && Number.isFinite(obj.timeoutMs)) {
      out.timeoutMs = obj.timeoutMs;
    }
    return out;
  } catch (err) {
    if (err instanceof AxiError) throw err;
    throw new AxiError(`failed to read config: ${path}`, "CONFIG_ERROR", [
      "Fix or remove ~/.config/z2m-axi/config.json, then run `z2m-axi config set --url ...`",
    ]);
  }
}

export function writeConfigFile(path: string, config: Z2mConfigFile): void {
  const dir = join(path, "..");
  mkdirSync(dir, { recursive: true });
  const body = `${JSON.stringify(config, null, 2)}\n`;
  writeFileSync(path, body, { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // best-effort on platforms without chmod
  }
}

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new AxiError(`base URL must start with http:// or https://`, "VALIDATION_ERROR", [
      "Example: --url http://192.168.1.10:8080",
    ]);
  }
  try {
    // Validate
    new URL(trimmed);
  } catch {
    throw new AxiError(`invalid base URL: ${url}`, "VALIDATION_ERROR");
  }
  return trimmed;
}

export interface ResolveConfigOptions {
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
  urlFlag?: string;
  tokenFlag?: string;
  timeoutFlag?: number;
  configPath?: string;
}

export function resolveConfig(options: ResolveConfigOptions = {}): ResolvedConfig {
  const home = options.homeDir ?? homedir();
  const env = options.env ?? process.env;
  const configPath = options.configPath ?? defaultConfigPath(home);
  const file = loadConfigFile(configPath);

  let baseUrl = DEFAULT_BASE_URL;
  let baseSource: ResolvedConfig["sources"]["baseUrl"] = "default";
  if (file.baseUrl) {
    baseUrl = normalizeBaseUrl(file.baseUrl);
    baseSource = "config";
  }
  if (env.Z2M_URL && env.Z2M_URL.trim() !== "") {
    baseUrl = normalizeBaseUrl(env.Z2M_URL);
    baseSource = "env";
  }
  if (options.urlFlag !== undefined) {
    baseUrl = normalizeBaseUrl(options.urlFlag);
    baseSource = "flag";
  }

  let authToken: string | undefined;
  let tokenSource: ResolvedConfig["sources"]["authToken"] = "none";
  if (file.authToken && file.authToken.length > 0) {
    authToken = file.authToken;
    tokenSource = "config";
  }
  if (env.Z2M_TOKEN !== undefined && env.Z2M_TOKEN !== "") {
    authToken = env.Z2M_TOKEN;
    tokenSource = "env";
  }
  if (options.tokenFlag !== undefined) {
    authToken = options.tokenFlag === "" ? undefined : options.tokenFlag;
    tokenSource = options.tokenFlag === "" ? "none" : "flag";
  }

  let timeoutMs = DEFAULT_TIMEOUT_MS;
  let timeoutSource: ResolvedConfig["sources"]["timeoutMs"] = "default";
  if (typeof file.timeoutMs === "number" && file.timeoutMs > 0) {
    timeoutMs = file.timeoutMs;
    timeoutSource = "config";
  }
  if (env.Z2M_TIMEOUT_MS && /^\d+$/.test(env.Z2M_TIMEOUT_MS)) {
    timeoutMs = Number(env.Z2M_TIMEOUT_MS);
    timeoutSource = "env";
  }
  if (options.timeoutFlag !== undefined) {
    timeoutMs = options.timeoutFlag;
    timeoutSource = "flag";
  }

  return {
    baseUrl,
    authToken,
    timeoutMs,
    configPath,
    sources: {
      baseUrl: baseSource,
      authToken: tokenSource,
      timeoutMs: timeoutSource,
    },
  };
}

/** Build ws:// or wss:// URL for the Z2M frontend API path. */
export function buildWsUrl(baseUrl: string, authToken?: string, basePath = "/"): string {
  const u = new URL(baseUrl);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  const pathBase = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  const apiPath = `${pathBase}/api`.replace(/\/{2,}/g, "/");
  u.pathname = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
  u.search = "";
  u.hash = "";
  if (authToken) {
    u.searchParams.set("token", authToken);
  }
  return u.toString();
}
