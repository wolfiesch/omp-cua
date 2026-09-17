import { describe, expect, test } from "bun:test";
import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import cuaExtension, { parseCuaCommand } from "./index";

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];
type DriverExecResult = Awaited<ReturnType<ExtensionAPI["exec"]>>;

const DEFAULT_EXEC_RESULT: DriverExecResult = {
  code: 0,
  stdout: "running",
  stderr: "",
  killed: false,
};

function createHarness(resultOrError: DriverExecResult | Error = DEFAULT_EXEC_RESULT) {
  let registered: RegisteredCommand | undefined;
  const execCalls: Array<{ command: string; args: string[]; timeout: number | undefined }> = [];
  const notifications: Array<{ message: string; type: string }> = [];

  const mockPi: Pick<ExtensionAPI, "setLabel" | "registerCommand" | "exec"> = {
    setLabel(_label: string) {
      // Host label registration
    },
    registerCommand(name: string, command: RegisteredCommand) {
      expect(name).toBe("cua");
      registered = command;
    },
    async exec(command: string, args: string[], options?: Parameters<ExtensionAPI["exec"]>[2]) {
      execCalls.push({ command, args, timeout: options?.timeout });
      if (resultOrError instanceof Error) {
        throw resultOrError;
      }
      return resultOrError;
    },
  };

  const pi = mockPi as unknown as ExtensionAPI;

  const mockCtx: Pick<ExtensionCommandContext, "ui"> = {
    ui: {
      notify(message: string, type: string) {
        notifications.push({ message, type });
      },
    } as ExtensionCommandContext["ui"],
  };

  const ctx = mockCtx as unknown as ExtensionCommandContext;

  cuaExtension(pi);
  if (!registered) throw new Error("extension did not register /cua");
  return { command: registered, ctx, execCalls, notifications };
}

describe("parseCuaCommand", () => {
  test("defaults to status and normalizes input", () => {
    expect(parseCuaCommand("")).toBe("status");
    expect(parseCuaCommand("  PeRmiSsIoNs  ")).toBe("permissions");
  });

  test("rejects arbitrary driver arguments", () => {
    expect(() => parseCuaCommand("update --apply")).toThrow();
  });
});

describe("cua extension", () => {
  test("runs fixed driver arguments without a shell and reports success", async () => {
    const harness = createHarness({ code: 0, stdout: "running", stderr: "", killed: false });
    await harness.command.handler("permissions", harness.ctx);

    expect(harness.execCalls).toEqual([
      { command: "cua-driver", args: ["permissions", "status", "--json"], timeout: 30_000 },
    ]);
    expect(harness.notifications).toHaveLength(1);
    expect(harness.notifications[0].type).toBe("info");
    expect(harness.notifications[0].message).toContain("running");
  });

  test("killed result with code 0 reports termination error instead of ok", async () => {
    const harness = createHarness({ code: 0, stdout: "", stderr: "", killed: true });
    await harness.command.handler("doctor", harness.ctx);

    expect(harness.notifications).toHaveLength(1);
    expect(harness.notifications[0].type).toBe("error");
    expect(harness.notifications[0].message).toContain("Command timed out or was terminated (30s limit).");
    expect(harness.notifications[0].message).not.toContain("ok");
  });

  test("killed result with partial output retains output and error severity", async () => {
    const harness = createHarness({ code: 0, stdout: "partial probe details", stderr: "", killed: true });
    await harness.command.handler("status", harness.ctx);

    expect(harness.notifications).toHaveLength(1);
    expect(harness.notifications[0].type).toBe("error");
    expect(harness.notifications[0].message).toContain("Command timed out or was terminated (30s limit).");
    expect(harness.notifications[0].message).toContain("partial probe details");
  });

  test("nonzero exit with whitespace-only stderr retains stdout detail", async () => {
    const harness = createHarness({ code: 1, stdout: "probe details", stderr: "   \n", killed: false });
    await harness.command.handler("status", harness.ctx);

    expect(harness.notifications).toHaveLength(1);
    expect(harness.notifications[0].type).toBe("error");
    expect(harness.notifications[0].message).toContain("probe details");
    expect(harness.notifications[0].message).not.toContain("exit 1");
  });

  test("nonzero exit with distinct stdout and stderr preserves both in order", async () => {
    const harness = createHarness({
      code: 2,
      stdout: "stdout diagnostic",
      stderr: "stderr diagnostic",
      killed: false,
    });
    await harness.command.handler("status", harness.ctx);

    expect(harness.notifications).toHaveLength(1);
    expect(harness.notifications[0].type).toBe("error");
    expect(harness.notifications[0].message).toContain("stdout diagnostic\nstderr diagnostic");
  });

  test("nonzero exit with empty output falls back to exit code", async () => {
    const harness = createHarness({ code: 13, stdout: "", stderr: "", killed: false });
    await harness.command.handler("status", harness.ctx);

    expect(harness.notifications).toHaveLength(1);
    expect(harness.notifications[0].type).toBe("error");
    expect(harness.notifications[0].message).toContain("exit 13");
    expect(harness.notifications[0].message).toContain("https://cua.ai/driver");
  });

  test("thrown exec error reports setup guidance without crashing", async () => {
    const harness = createHarness(new Error("spawn cua-driver ENOENT"));
    await harness.command.handler("status", harness.ctx);

    expect(harness.notifications).toHaveLength(1);
    expect(harness.notifications[0].type).toBe("error");
    expect(harness.notifications[0].message).toContain("spawn cua-driver ENOENT");
    expect(harness.notifications[0].message).toContain("https://cua.ai/driver");
  });

  test("help is local and does not execute the driver", async () => {
    const harness = createHarness();
    await harness.command.handler("help", harness.ctx);

    expect(harness.execCalls).toHaveLength(0);
    expect(harness.notifications).toHaveLength(1);
    expect(harness.notifications[0].type).toBe("info");
  });

  test("invalid arguments do not execute the driver and report error", async () => {
    const harness = createHarness();
    await harness.command.handler("permissions --dangerously-bypass-approvals", harness.ctx);

    expect(harness.execCalls).toHaveLength(0);
    expect(harness.notifications).toHaveLength(1);
    expect(harness.notifications[0].type).toBe("error");
  });

  test("offers prefix completions", () => {
    const harness = createHarness();
    const completions = harness.command.getArgumentCompletions?.("per");
    expect(completions?.map(item => item.value)).toEqual(["permissions"]);
  });
});
