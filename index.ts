import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";

const DRIVER = "cua-driver";
const COMMAND_TIMEOUT_MS = 30_000;
const INSTALL_URL = "https://cua.ai/driver";

export type CuaCommand = "status" | "doctor" | "permissions" | "tools" | "version" | "updates" | "help";

interface CommandSpec {
  readonly args: readonly string[];
  readonly label: string;
}

const COMMANDS: Readonly<Record<Exclude<CuaCommand, "help">, CommandSpec>> = {
  status: { args: ["status"], label: "Cua Driver status" },
  doctor: { args: ["doctor", "--json"], label: "Cua Driver diagnostics" },
  permissions: { args: ["permissions", "status", "--json"], label: "Cua Driver permissions" },
  tools: { args: ["list-tools"], label: "Cua Driver tools" },
  version: { args: ["--version"], label: "Cua Driver version" },
  updates: { args: ["check-update", "--json"], label: "Cua Driver update status" },
};

const COMPLETIONS = [
  { value: "status", label: "status", description: "Show daemon status" },
  { value: "doctor", label: "doctor", description: "Run end-to-end diagnostics" },
  { value: "permissions", label: "permissions", description: "Show OS permission grants" },
  { value: "tools", label: "tools", description: "List driver operations" },
  { value: "version", label: "version", description: "Show the installed driver version" },
  { value: "updates", label: "updates", description: "Check for a newer driver release" },
  { value: "help", label: "help", description: "Show command usage" },
] as const;

const HELP = [
  "Usage: /cua [status|doctor|permissions|tools|version|updates|help]",
  "",
  "Cua's MCP operations are mounted by OMP as on-demand xd:// tools.",
  "This command only inspects the driver; it never grants permissions or installs updates.",
].join("\n");

export function parseCuaCommand(input: string): CuaCommand {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return "status";
  if (COMPLETIONS.some(item => item.value === normalized)) return normalized as CuaCommand;
  throw new Error(HELP);
}

type DriverExecResult = Awaited<ReturnType<ExtensionAPI["exec"]>>;

function combineStreams(stdout: string, stderr: string): string {
  const trimmedStdout = stdout.trim();
  const trimmedStderr = stderr.trim();
  if (trimmedStdout && trimmedStderr) {
    return `${trimmedStdout}\n${trimmedStderr}`;
  }
  return trimmedStdout || trimmedStderr;
}

function formatFailure(result: DriverExecResult): string {
  const streams = combineStreams(result.stdout, result.stderr);
  let detail: string;
  if (result.killed) {
    detail = streams
      ? `Command timed out or was terminated (30s limit).\n${streams}`
      : "Command timed out or was terminated (30s limit).";
  } else {
    detail = streams || `exit ${result.code}`;
  }
  return `${detail}\n\nInstall or repair Cua Driver: ${INSTALL_URL}`;
}

async function runCommand(pi: ExtensionAPI, command: Exclude<CuaCommand, "help">): Promise<{
  readonly label: string;
  readonly output: string;
  readonly ok: boolean;
}> {
  const spec = COMMANDS[command];
  try {
    const result = await pi.exec(DRIVER, [...spec.args], { timeout: COMMAND_TIMEOUT_MS });
    const ok = result.code === 0 && !result.killed;
    return {
      label: spec.label,
      output: ok ? result.stdout.trim() || "ok" : formatFailure(result),
      ok,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      label: spec.label,
      output: `${detail}\n\nInstall Cua Driver: ${INSTALL_URL}`,
      ok: false,
    };
  }
}

async function handleCommand(pi: ExtensionAPI, input: string, ctx: ExtensionCommandContext): Promise<void> {
  let command: CuaCommand;
  try {
    command = parseCuaCommand(input);
  } catch (error) {
    ctx.ui.notify(error instanceof Error ? error.message : HELP, "error");
    return;
  }

  if (command === "help") {
    ctx.ui.notify(HELP, "info");
    return;
  }

  const result = await runCommand(pi, command);
  ctx.ui.notify(`${result.label}\n${result.output}`, result.ok ? "info" : "error");
}

export default function cuaExtension(pi: ExtensionAPI): void {
  pi.setLabel("Cua Driver");
  pi.registerCommand("cua", {
    description: "Inspect the Cua computer-use backend",
    getArgumentCompletions: prefix => {
      const normalized = prefix.trim().toLowerCase();
      const matches = COMPLETIONS.filter(item => item.value.startsWith(normalized));
      return matches.length > 0 ? [...matches] : null;
    },
    handler: (args, ctx) => handleCommand(pi, args, ctx),
  });
}
