import { describe, expect, it } from "vitest";
import { AxiError } from "axi-sdk-js";
import { requireConfirmation } from "../src/confirm.js";

describe("confirm", () => {
  it("accepts matching --confirm flag", async () => {
    await expect(
      requireConfirmation({
        token: "permit-join",
        summary: "open network",
        confirmFlag: "permit-join",
        isTty: false,
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects mismatched --confirm flag", async () => {
    await expect(
      requireConfirmation({
        token: "permit-join",
        summary: "open network",
        confirmFlag: "yes",
        isTty: false,
      }),
    ).rejects.toMatchObject({ code: "CONFIRM_REQUIRED" } satisfies Partial<AxiError>);
  });

  it("requires flag when non-tty", async () => {
    await expect(
      requireConfirmation({
        token: "permit-join",
        summary: "open network",
        isTty: false,
      }),
    ).rejects.toMatchObject({ code: "CONFIRM_REQUIRED" });
  });

  it("prompts on tty and accepts typed token", async () => {
    await expect(
      requireConfirmation({
        token: "permit-join",
        summary: "open network",
        isTty: true,
        promptFn: async () => "permit-join",
      }),
    ).resolves.toBeUndefined();
  });

  it("declines on tty wrong answer", async () => {
    await expect(
      requireConfirmation({
        token: "permit-join",
        summary: "open network",
        isTty: true,
        promptFn: async () => "nope",
      }),
    ).rejects.toMatchObject({ code: "CONFIRM_DECLINED" });
  });
});
