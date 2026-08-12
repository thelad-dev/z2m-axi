import { describe, expect, it } from "vitest";
import { VERSION } from "../src/version.js";
import { runCli, startMockZ2m, tempHome } from "./helpers.js";

describe("cli integration", () => {
  it("prints version on fast path", async () => {
    const { stdout, exitCode } = await runCli(["--version"], { homeDir: tempHome() });
    // fast path is in bin; main still handles via runAxiCli
    expect(exitCode).toBe(0);
    expect(stdout.trim() === VERSION || stdout.includes(VERSION)).toBe(true);
  });

  it("home dashboard against mock frontend", async () => {
    const mock = await startMockZ2m();
    try {
      const home = tempHome();
      const { stdout, exitCode } = await runCli([], {
        homeDir: home,
        env: { Z2M_URL: mock.baseUrl },
      });
      expect(exitCode).toBe(0);
      expect(stdout).toContain("devices:");
      expect(stdout).toContain("permit_join");
      expect(stdout).toContain(mock.baseUrl);
      expect(stdout).not.toMatch(/password|secret/i);
    } finally {
      await mock.close();
    }
  });

  it("device list and show", async () => {
    const mock = await startMockZ2m();
    try {
      const home = tempHome();
      const env = { Z2M_URL: mock.baseUrl };
      const list = await runCli(["device", "list"], { homeDir: home, env });
      expect(list.exitCode).toBe(0);
      expect(list.stdout).toContain("kitchen_plug");
      expect(list.stdout).not.toContain("Coordinator");

      const show = await runCli(["device", "show", "kitchen_plug"], {
        homeDir: home,
        env,
      });
      expect(show.exitCode).toBe(0);
      expect(show.stdout).toContain("0x00158d00018255df");
      expect(show.stdout).toContain("ZNCZ02LM");
    } finally {
      await mock.close();
    }
  });

  it("bridge info", async () => {
    const mock = await startMockZ2m();
    try {
      const { stdout, exitCode } = await runCli(["bridge", "info"], {
        homeDir: tempHome(),
        env: { Z2M_URL: mock.baseUrl },
      });
      expect(exitCode).toBe(0);
      expect(stdout).toContain("2.1.0");
      expect(stdout).toContain("channel:");
      expect(stdout).toContain("15");
    } finally {
      await mock.close();
    }
  });

  it("bridge info rejects extra positionals", async () => {
    const { stdout, exitCode } = await runCli(["bridge", "info", "foo"], {
      homeDir: tempHome(),
      env: { Z2M_URL: "http://127.0.0.1:1" },
    });
    expect(exitCode).toBe(2);
    expect(stdout).toContain("unexpected argument");
    expect(stdout).toContain("foo");
  });

  it("device list waits for delayed retained devices", async () => {
    const mock = await startMockZ2m({ devicesDelayMs: 120 });
    try {
      const { stdout, exitCode } = await runCli(["device", "list"], {
        homeDir: tempHome(),
        env: { Z2M_URL: mock.baseUrl, Z2M_TIMEOUT_MS: "2000" },
        clientOptions: { settleMs: 20 },
      });
      expect(exitCode).toBe(0);
      expect(stdout).toContain("kitchen_plug");
      expect(stdout).not.toContain("0 devices found");
    } finally {
      await mock.close();
    }
  });

  it("blocks permit-join without confirmation", async () => {
    const mock = await startMockZ2m();
    try {
      const { stdout, exitCode } = await runCli(["permit-join", "on"], {
        homeDir: tempHome(),
        env: { Z2M_URL: mock.baseUrl },
      });
      expect(exitCode).toBe(2);
      expect(stdout).toContain("CONFIRM_REQUIRED");
      expect(stdout).toContain("--confirm permit-join");
    } finally {
      await mock.close();
    }
  });

  it("permit-join on/off with --confirm", async () => {
    const mock = await startMockZ2m();
    try {
      const home = tempHome();
      const env = { Z2M_URL: mock.baseUrl };
      const on = await runCli(
        ["permit-join", "on", "--time", "60", "--confirm", "permit-join"],
        { homeDir: home, env },
      );
      expect(on.exitCode).toBe(0);
      expect(on.stdout).toContain("permit_join enabled");
      expect(on.stdout).toContain("60");

      const off = await runCli(
        ["permit-join", "off", "--confirm", "permit-join-off"],
        { homeDir: home, env },
      );
      expect(off.exitCode).toBe(0);
      expect(off.stdout).toContain("permit_join disabled");
    } finally {
      await mock.close();
    }
  });

  it("device interview requires matching confirm token", async () => {
    const mock = await startMockZ2m();
    try {
      const home = tempHome();
      const env = { Z2M_URL: mock.baseUrl };
      const denied = await runCli(["device", "interview", "kitchen_plug"], {
        homeDir: home,
        env,
      });
      expect(denied.exitCode).toBe(2);
      expect(denied.stdout).toContain("CONFIRM_REQUIRED");

      const ok = await runCli(
        ["device", "interview", "kitchen_plug", "--confirm", "kitchen_plug"],
        { homeDir: home, env },
      );
      expect(ok.exitCode).toBe(0);
      expect(ok.stdout).toContain("interview started");
    } finally {
      await mock.close();
    }
  });

  it("config show masks token", async () => {
    const home = tempHome();
    const set = await runCli(
      ["config", "set", "--url", "http://example:8080", "--token", "s3cret-token-value"],
      { homeDir: home, env: {} },
    );
    expect(set.exitCode).toBe(0);
    expect(set.stdout).not.toContain("s3cret-token-value");

    const show = await runCli(["config", "show"], { homeDir: home, env: {} });
    expect(show.exitCode).toBe(0);
    expect(show.stdout).toContain("http://example:8080");
    expect(show.stdout).not.toContain("s3cret-token-value");
    expect(show.stdout).toMatch(/auth_token:/);
  });

  it("rejects unknown flags", async () => {
    const { stdout, exitCode } = await runCli(["device", "list", "--nope"], {
      homeDir: tempHome(),
      env: { Z2M_URL: "http://127.0.0.1:1" },
    });
    expect(exitCode).toBe(2);
    expect(stdout).toContain("unknown flag");
  });

  it("auth failure surfaces structured error", async () => {
    const mock = await startMockZ2m({ authToken: "expected" });
    try {
      const { stdout, exitCode } = await runCli(["bridge", "info"], {
        homeDir: tempHome(),
        env: { Z2M_URL: mock.baseUrl }, // no token
      });
      expect(exitCode).toBe(1);
      expect(stdout).toMatch(/AUTH_ERROR|unauthorized|CONNECT/i);
      expect(stdout).not.toContain("expected");
    } finally {
      await mock.close();
    }
  });

  it("device list empty state is definitive", async () => {
    const mock = await startMockZ2m({ devices: [] });
    try {
      const { stdout, exitCode } = await runCli(["device", "list"], {
        homeDir: tempHome(),
        env: { Z2M_URL: mock.baseUrl },
      });
      expect(exitCode).toBe(0);
      expect(stdout).toContain("0 devices found");
    } finally {
      await mock.close();
    }
  });
});
