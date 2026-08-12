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
});
