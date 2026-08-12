import { createInterface } from "node:readline";
import { AxiError } from "axi-sdk-js";

export interface ConfirmOptions {
  /** Exact token the user/agent must supply (e.g. "permit-join", device ieee). */
  token: string;
  /** Human-readable summary of the mutation. */
  summary: string;
  /** Value from --confirm flag, if any. */
  confirmFlag?: string;
  /** Override TTY detection (tests). */
  isTty?: boolean;
  /** Injected prompt (tests). */
  promptFn?: (question: string) => Promise<string>;
}

/**
 * Gate mutating operations.
 *
 * Captain policy: writes require interactive user confirmation.
 * AXI policy: every operation must be completable with flags alone.
 *
 * Resolution:
 * 1. `--confirm <token>` matching the expected token → proceed (agent path)
 * 2. TTY without flag → interactive prompt asking the user to type the token
 * 3. Non-TTY without flag → structured error with the exact re-run command
 */
export async function requireConfirmation(options: ConfirmOptions): Promise<void> {
  const expected = options.token;
  if (options.confirmFlag !== undefined) {
    if (options.confirmFlag === expected) return;
    throw new AxiError(
      `confirmation mismatch (expected "${expected}")`,
      "CONFIRM_REQUIRED",
      [
        `Re-run with --confirm ${expected}`,
        `Mutation: ${options.summary}`,
      ],
    );
  }

  const tty =
    options.isTty ??
    (Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY));

  if (!tty) {
    throw new AxiError(
      `mutation requires confirmation: ${options.summary}`,
      "CONFIRM_REQUIRED",
      [
        `Re-run with --confirm ${expected}`,
        "Mutations open the Zigbee mesh or re-interview devices — confirm intentionally",
      ],
    );
  }

  const prompt =
    options.promptFn ??
    ((question: string) =>
      new Promise<string>((resolve, reject) => {
        const rl = createInterface({ input: process.stdin, output: process.stderr });
        rl.question(question, (answer) => {
          rl.close();
          resolve(answer);
        });
        rl.on("error", reject);
      }));

  const answer = (
    await prompt(
      `Confirm mutation: ${options.summary}\nType "${expected}" to proceed: `,
    )
  ).trim();

  if (answer !== expected) {
    throw new AxiError("confirmation declined", "CONFIRM_DECLINED", [
      `Type exactly "${expected}" or pass --confirm ${expected}`,
    ]);
  }
}
