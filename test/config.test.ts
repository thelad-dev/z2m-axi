import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildWsUrl,
  loadConfigFile,
  maskSecret,
  resolveConfig,
  writeConfigFile,
} from "../src/config.js";
import { tempHome } from "./helpers.js";

describe("config", () => {
  it("masks secrets without echoing full token", () => {
    expect(maskSecret(undefined)).toBeUndefined();
    expect(maskSecret("ab")).toBe("****");
    expect(maskSecret("supersecrettoken")).toMatch(/chars\)/);
    expect(maskSecret("supersecrettoken")).not.toContain("supersecrettoken");
  });

  it("resolves defaults, file, env, flag priority", () => {
    const home = tempHome();
    const path = join(home, ".config", "z2m-axi", "config.json");
    mkdirSync(join(home, ".config", "z2m-axi"), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify({ baseUrl: "http://from-file:8080", authToken: "file-token" }),
    );

    const fromFile = resolveConfig({ homeDir: home, env: {} });
    expect(fromFile.baseUrl).toBe("http://from-file:8080");
    expect(fromFile.authToken).toBe("file-token");
    expect(fromFile.sources.baseUrl).toBe("config");

    const fromEnv = resolveConfig({
      homeDir: home,
      env: { Z2M_URL: "http://from-env:9090", Z2M_TOKEN: "env-token" },
    });
    expect(fromEnv.baseUrl).toBe("http://from-env:9090");
    expect(fromEnv.authToken).toBe("env-token");
    expect(fromEnv.sources.baseUrl).toBe("env");

    const fromFlag = resolveConfig({
      homeDir: home,
      env: { Z2M_URL: "http://from-env:9090" },
      urlFlag: "http://from-flag:8080",
      tokenFlag: "flag-token",
    });
    expect(fromFlag.baseUrl).toBe("http://from-flag:8080");
    expect(fromFlag.authToken).toBe("flag-token");
    expect(fromFlag.sources.baseUrl).toBe("flag");
  });

  it("writes config with restrictive mode content", () => {
    const home = tempHome();
    const path = join(home, ".config", "z2m-axi", "config.json");
    writeConfigFile(path, { baseUrl: "http://x:8080", authToken: "secret" });
    const loaded = loadConfigFile(path);
    expect(loaded.baseUrl).toBe("http://x:8080");
    expect(loaded.authToken).toBe("secret");
    const raw = readFileSync(path, "utf8");
    expect(raw).toContain("secret");
  });

  it("builds ws url and attaches token", () => {
    expect(buildWsUrl("http://h:8080")).toBe("ws://h:8080/api");
    expect(buildWsUrl("https://h:8080/", "tok")).toBe("wss://h:8080/api?token=tok");
  });
});
