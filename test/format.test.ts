import { describe, expect, it } from "vitest";
import {
  deviceRow,
  filterDevices,
  findDevice,
  sortDevices,
  summarizeBridge,
} from "../src/format.js";
import { SAMPLE_DEVICES, SAMPLE_INFO } from "./helpers.js";

describe("format", () => {
  it("filters coordinator by default and supports search/type", () => {
    const usable = filterDevices(SAMPLE_DEVICES);
    expect(usable.every((d) => d.type !== "Coordinator")).toBe(true);
    expect(filterDevices(SAMPLE_DEVICES, { type: "EndDevice" })).toHaveLength(1);
    expect(filterDevices(SAMPLE_DEVICES, { search: "kitchen" })[0]?.friendly_name).toBe(
      "kitchen_plug",
    );
  });

  it("finds by ieee or friendly name case-insensitively", () => {
    expect(findDevice(SAMPLE_DEVICES, "kitchen_plug")?.ieee_address).toBe(
      "0x00158d00018255df",
    );
    expect(findDevice(SAMPLE_DEVICES, "0x00158D00018255DF")?.friendly_name).toBe(
      "kitchen_plug",
    );
  });

  it("sorts by friendly name", () => {
    const names = sortDevices(filterDevices(SAMPLE_DEVICES)).map(
      (d) => d.friendly_name,
    );
    expect(names).toEqual([...names].sort((a, b) => a!.localeCompare(b!)));
  });

  it("summarizes bridge without dumping config secrets", () => {
    const s = summarizeBridge(SAMPLE_INFO);
    expect(s.version).toBe("2.1.0");
    expect(s.permit_join).toBe(false);
    expect(s.channel).toBe(15);
    expect(s).not.toHaveProperty("config");
  });

  it("maps device rows", () => {
    const row = deviceRow(SAMPLE_DEVICES[0]!);
    expect(row.name).toBe("kitchen_plug");
    expect(row.model).toBe("ZNCZ02LM");
    expect(row.interview).toBe("SUCCESSFUL");
  });
});
