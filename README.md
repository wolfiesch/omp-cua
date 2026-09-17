# omp-cua

Use [Cua Driver](https://github.com/trycua/cua) as a low-overhead computer-use backend in [Oh My Pi](https://github.com/can1357/oh-my-pi).

`omp-cua` connects OMP to Cua's cross-platform desktop driver. Cua's operations stay mounted behind OMP's `xd://` device boundary, so dozens of computer-use schemas do not occupy every model request. A small `/cua` command handles diagnostics without duplicating Cua's action or permission logic.

## What you get

- Background desktop control through Cua Driver on macOS, Windows, and Linux
- OMP-native MCP discovery from the plugin package
- On-demand Cua tool schemas instead of a permanently expanded tool roster
- `/cua` diagnostics for daemon health, permissions, versions, and available tools
- Cua's upstream skill pack for safe observe, act, and verify workflows

This is an alternative backend to OMP's built-in `/computer` tool. It does not replace or patch OMP internals.

## Install

### 1. Install Cua Driver

Follow the current [Cua Driver installation instructions](https://github.com/trycua/cua/releases?q=cua-driver-rs&expanded=true). The driver publishes native builds for macOS, Windows, and Linux.

Verify the executable is available:

```console
cua-driver --version
```

> **Release note:** GitHub labels recent driver release tags (such as `0.28.2`) as "Pre-release". Upstream explicitly notes this label prevents monorepo "Latest" switching on GitHub, while plain SemVer releases are stable on their distribution channels. The verified installed baseline is `0.23.2`.

### 2. Complete driver setup

Install Cua's version-matched agent instructions. In a clean OMP-only environment, ensure the shared skills directory exists before installing:

Before running these commands on an existing setup, inspect `cua-driver skills status` and any existing `$HOME/.agents/skills/cua-driver` path, including its symlink or junction target. Stop if the parent is a file or the skill is user-managed; do not delete, overwrite, or add `--force`. Ordinary installation replaces dangling links or junctions even without `--force`.

**POSIX:**

```sh
mkdir -p "$HOME/.agents/skills"
cua-driver skills install
cua-driver skills status
```

**Windows PowerShell:**

```powershell
New-Item -ItemType Directory -Force -Path (Join-Path $HOME ".agents/skills") | Out-Null
cua-driver skills install
cua-driver skills status
```

**How skill setup works:**
- Cua Driver's installer checks for known agent skill directories (`AGENTS`). For the shared `.agents/skills` destination, Cua only auto-creates the directory if a `.codex` installation marker exists. Creating `$HOME/.agents/skills` beforehand ensures the installer links the skill pack even in an OMP-only setup without Codex.
- The installer may label this shared destination "Codex", but Codex is not required: OMP natively discovers skills from `$HOME/.agents/skills` independently of foreign user providers.
- **Conflict handling:** Cua `0.28.2` preserves existing directories and resolving links, but replaces dangling symlinks or junctions. Inspect user-managed paths before installation, not only afterward. If OMP settings explicitly exclude the skill or provider, identify that setting rather than overriding it.
- **MCP resources vs. native skills:** While Cua 0.28+ also embeds the skill as MCP resources (`skill://cua-driver/SKILL.md`), OMP resource reads do not activate a native host skill. Filesystem setup in `.agents/skills` remains necessary for native OMP skill discovery.

On macOS, request and verify the required Accessibility and Screen Recording grants through the signed Cua app:

```console
cua-driver permissions grant
```

The operating system owns these grants. `omp-cua` never bypasses or writes them. On macOS, launching the normal MCP server command may start the signed Cua app/daemon to maintain macOS TCC attribution.

### 3. Install the OMP plugin

```console
omp plugin install github:wolfiesch/omp-cua
```

Restart OMP once so the extension and MCP server are discovered.

**Managing the MCP server in an active session:**
- Restarting OMP discovers newly installed commands and MCP servers.
- `/mcp reload` rediscovers and reconnects all MCP server configurations from plugins and settings.
- `/mcp reconnect cua-driver` reconnects an already known `cua-driver` server instance.
- `/mcp list` inspects server source, status, and loaded tools.
- `/mcp test cua-driver` tests connectivity.

*Note:* These user-run setup commands may start the configured server process; they are not passive filesystem checks.

## Use

Ask OMP to operate a desktop app normally:

> Open Calculator, enter 144 / 12, and tell me the result.

The Cua skill selects the driver. OMP loads individual Cua schemas through its mounted `xd://` device surface only when needed.

Inspect the integration from the TUI:

```text
/cua status
/cua permissions
/cua doctor
/cua tools
/cua version
/cua updates
```

`/cua` with no argument is equivalent to `/cua status`.
- `/cua tools` lists driver operations (`cua-driver list-tools` lists driver operations; it is not evidence that OMP mounted the server).
- `/cua updates` fetches release metadata and writes the driver's update-check cache.

Every subcommand is diagnostic and uses fixed driver arguments. It cannot grant permissions, install updates, perform desktop actions, or forward arbitrary shell input. Diagnostics are not guaranteed to be filesystem-write-free: `/cua updates` can fetch release metadata and write the driver's update-check cache.

## How it works

```text
OMP session
├── omp-cua extension
│   └── /cua diagnostics
└── omp-cua .mcp.json
    └── cua-driver mcp
        └── Cua Driver daemon
            └── native accessibility, capture, and input APIs
```

The plugin has two intentionally narrow responsibilities:

1. Declare `cua-driver mcp` through OMP's package-local `.mcp.json` capability (stdio `cua-driver`, argv `["mcp"]`, timeout `30000`).
2. Register a stateless diagnostics command that invokes a small fixed set of CLI diagnostics.

Cua Driver remains the source of truth for tool schemas, session authorization, platform support, updates, and permission handling. This avoids version-skewed wrappers and keeps the integration maintainable.

## Security model

- Extensions and local MCP servers run with the user's account permissions. They are not sandboxes.
- Cua Driver defaults to its standard authorization mode. Standard authorization requires explicit confirmation for sensitive actions, but is not universal per-action confirmation for every primitive operation. Do not use `--dangerously-bypass-approvals` unless you intentionally accept unrestricted desktop control.
- Existing logged-in browser profiles require a separate, explicit Cua approval flow.
- The plugin never installs or updates Cua Driver, changes its configuration, or grants operating-system permissions.
- On macOS, the normal MCP command connects to the signed Cua app/daemon to preserve OS TCC attribution. Do not bypass this with `--direct` in standard setup.
- Shipped `.mcp.json` configuration remains standard: stdio `cua-driver`, argv `["mcp"]`, timeout `30000`.
- Review Cua's [security documentation](https://github.com/trycua/cua/security) before using the driver on sensitive machines.

See [SECURITY.md](SECURITY.md) for reporting issues in this integration.

## Troubleshooting

Run the focused diagnostics first:

```text
/cua doctor
```

If OMP cannot find the binary, confirm `cua-driver` is on the `PATH` inherited by the terminal that launches OMP. For newly installed MCP configuration, restart OMP or use `/mcp reload`; use `/mcp reconnect cua-driver` only when the server is already known.

Check for a current driver release without installing it:

```text
/cua updates
```

Driver defects and platform compatibility issues belong in [trycua/cua](https://github.com/trycua/cua/issues). Plugin discovery or `/cua` command defects belong in this repository.

## Uninstall

```console
omp plugin uninstall omp-cua
```

This removes the OMP plugin. It does not remove Cua Driver or revoke operating-system permissions.

## Development

Requires [Bun](https://bun.sh/):

```console
bun install
bun test
bun run typecheck
```

To test a checkout without installing it, pass the package directory:

```console
omp --extension .
```

From another directory, pass the absolute path to the package directory:

```console
omp --extension /absolute/path/to/omp-cua
```

**Why full-package directory loading matters:**
OMP's extension-root discovery registers directory paths as extension package roots, enabling discovery of sibling capabilities such as `.mcp.json`. Path entrypoints pointing to individual files (such as the legacy `./index.ts` example) contribute zero sub-discovery surface and drop sibling capabilities. Pointing `--extension` to the package directory ensures both the extension commands and the MCP server are properly registered.

## Compatibility

Verified on macOS arm64 with Bun `1.4.0` on 2026-09-16:

- OMP `18.2.2` npm host types: strict typecheck and 12 diagnostic tests pass.
- Actual host APIs load `/cua` and the package's MCP configuration from both a checkout directory and the packed distribution. An explicit `index.ts` loads the command but not sibling MCP configuration.
- Isolated Cua `0.28.2` installs its version-matched skill into the shared `.agents/skills` path without Codex; OMP's native `agents` provider discovers it.
- OMP's MCP client connects to the isolated driver with `mcp --direct`: all 56 tool names match `list-tools`, and the 68,469-byte skill resource matches the installed skill. No tool actions were called. `--direct` is test isolation only, not the distributed configuration.
- The released OMP `18.2.2` binary registers `/cua` and emits help and `cua-driver 0.28.2` notifications over RPC; both complete with `agentInvoked: false` and no agent turn. The credential-free scratch profile needed explicit `--model openai/gpt-4.1` selection to reach readiness (no API key or model request); its normal MCP server was disabled for this command-only check.

The workstation's installed OMP `18.2.1` and Cua `0.23.2` were not upgraded. Cua `0.28.2` is labeled prerelease on GitHub as described above. Signed-app daemon startup, OS capture/input permissions, desktop actions, Windows, and Linux were not runtime-tested here; setup boundaries for those paths are source-reviewed, not certified by the isolated protocol checks.

## License

MIT. Cua Driver and Oh My Pi are separate projects with their own licenses.
