import { describe, expect, it } from "vitest";
import { Z2mClient } from "../src/client.js";
import { resolveConfig } from "../src/config.js";
import { startMockZ2m, tempHome } from "./helpers.js";

describe("Z2mClient", () => {
  it("loads retained snapshot and completes request/response", async () => {
    const mock = await startMockZ2m();
    try {
      const config = resolveConfig({
        homeDir: tempHome(),
        env: { Z2M_URL: mock.baseUrl },
      });
      const client = new Z2mClient({ config, settleMs: 50 });
      const snap = await client.ensureSnapshot();
      expect(snap.info?.version).toBe("2.1.0");
      expect(snap.devices?.length).toBeGreaterThan(0);

      const res = await client.request("bridge/request/permit_join", { time: 10 });
      expect(res.status).toBe("ok");
      expect((res.data as { time: number }).time).toBe(10);
      client.close();
    } finally {
      await mock.close();
    }
  });

  it("waits for delayed bridge/devices instead of returning empty", async () => {
    const mock = await startMockZ2m({ devicesDelayMs: 120 });
    try {
      const config = resolveConfig({
        homeDir: tempHome(),
        env: { Z2M_URL: mock.baseUrl, Z2M_TIMEOUT_MS: "2000" },
      });
      const client = new Z2mClient({ config, settleMs: 20 });
      const snap = await client.ensureSnapshot();
      expect(snap.info?.version).toBe("2.1.0");
      expect(snap.devices?.length).toBeGreaterThan(0);
      client.close();
    } finally {
      await mock.close();
    }
  });

  it("fails when bridge/devices never arrives", async () => {
    const mock = await startMockZ2m({ pushDevices: false });
    try {
      const config = resolveConfig({
        homeDir: tempHome(),
        env: { Z2M_URL: mock.baseUrl, Z2M_TIMEOUT_MS: "200" },
      });
      const client = new Z2mClient({ config, settleMs: 20 });
      await expect(client.ensureSnapshot()).rejects.toMatchObject({
        code: "CONNECT_ERROR",
        message: expect.stringContaining("bridge/devices"),
      });
      client.close();
    } finally {
      await mock.close();
    }
  });

  it("embeds transaction so bridge responses resolve", async () => {
    let seenTxn: string | undefined;
    const mock = await startMockZ2m({
      onRequest: (_path, payload) => {
        seenTxn =
          typeof payload.transaction === "string" ? payload.transaction : undefined;
        return { echoed: true };
      },
    });
    try {
      const config = resolveConfig({
        homeDir: tempHome(),
        env: { Z2M_URL: mock.baseUrl },
      });
      const client = new Z2mClient({ config, settleMs: 50 });
      const res = await client.request("bridge/request/health_check", { ping: 1 });
      expect(res.status).toBe("ok");
      expect(seenTxn).toMatch(/^z2m-axi-/);
      expect(res.transaction).toBe(seenTxn);
      client.close();
    } finally {
      await mock.close();
    }
  });
});
