# dsh-mcp-apps

MCP Apps support for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness), packaged as ordinary Cordis plugins.

The project deliberately keeps the protocol host and each presentation surface separate. Installing the bundle adds two independent rows: a Host service that shares the existing MCP connection and a Web renderer that runs App HTML behind a double-iframe sandbox. One AppBridge session can move between inline, fullscreen, and picture-in-picture surfaces without remounting its iframe.

## Which package should I install?

| Goal | Install |
|---|---|
| Use Codex, Claude Code, Pi, or portable Agent Plugins in DSH, including their MCP Apps | [`@openma/dsh-agents-plugins-bridge`](https://github.com/openma-ai/dsh-agents-plugins) only; it already carries MCP Apps |
| Add MCP Apps to a Web profile without the foreign-plugin bridge | `@openma/dsh-mcp-apps` |

The standalone package and the Bridge use the same Host and Web runtime
packages. Do not install both bundles into one profile just to get the
renderer twice.

## Install

```sh
dsh plugin --profile web add @openma/dsh-mcp-apps
```

From a local checkout, install dependencies and add only the root bundle:

```sh
npm install
dsh plugin --profile web add .
```

The full bundle is safe on a DSH composition that already provides `ctx.mcpApps`
and the generated `remote.mcpApps` namespace: the fallback Host row becomes a
no-op and the Web renderer reuses the existing Remote. If the active profile is
known to include the official Host already, installing only the renderer is the
minimal equivalent:

```sh
dsh plugin --profile web add ./packages/web
```

The renderer consumes a composition-provided Remote when present and mounts its
checked-in descriptor only for the standalone fallback Host.

The bundle patch mounts one kernel:

```yaml
- id: mcp-apps-bundle
  name: '@openma/dsh-mcp-apps'
```

That kernel owns two independent child rows, `mcp-apps-host` and
`mcp-apps-web`. Both rows point at package-owned wrapper exports. Each wrapper
resolves its runtime from this package's dependency graph, imports it through
the DSH Loader, and mounts it with `ctx.plugin`; profile-level dependency
hoisting is not required. The Agent Plugins Bridge uses the same wrapper shape
from its own root package.

Keep MCP server connections as their own plugin rows. DSH's `mcp-client` notices the optional `ctx.mcpApps` service and contributes its live connection automatically:

```yaml
- name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: weather
    transport: stdio
    command: weather-mcp-server
```

Tools, resources, prompts, model-facing execution, and AppBridge calls therefore reuse one MCP SDK `Client`, including its authentication and reconnect generation. This project does not open a second connection.

## Packages

| Package | Role |
| --- | --- |
| `@openma/dsh-mcp-apps` | Installable and nestable bundle kernel; owns the Host/Web child-row lifecycle |
| `@openma/dsh-mcp-apps-host` | Internal runtime package: `ctx.mcpApps` provider registry plus the generated Typert Host/Remote contract |
| `@openma/dsh-mcp-apps-web` | Internal runtime package: shape-driven Tool-result renderer, official AppBridge, and browser sandbox |

The flow is:

```text
dsh mcp-client
  └─ provider → @openma/dsh-mcp-apps-host
                    └─ Typert Remote → @openma/dsh-mcp-apps-web
                                           └─ AppBridge → sandboxed MCP App
```

Only `callTool` and `readResource` cross the browser Remote boundary. `readResource` accepts only `ui://` URIs. Host plugins may also call `listResources`, `listPrompts`, and `getPrompt` in process; this package does not inject those results into model context.

The Web renderer claims only settled results with all of the following:

- presentation card `mcp-app`;
- a `ui://` resource URI;
- exact MIME type `text/html;profile=mcp-app`;
- a schema-valid MCP Tool result.

Every other result declines the `tool.call.takeover` chain, leaving the normal keyed Tool view and generic fallback intact.

## Browser security boundary

Untrusted App HTML never runs in the DSH document. It is loaded into an opaque-origin inner data document behind an opaque-origin relay document. The renderer:

- installs CSP before App code, accepting only validated HTTP(S)/WS(S) domain sources;
- checks exact parent/child windows and expected origins on every relay message;
- reserves internal sandbox messages and uses a per-document generation marker;
- closes Host-to-App forwarding as soon as the inner document navigates;
- allows external navigation only to HTTP(S) URLs in a new tab;
- bounds inline height requests to 96–720 px;
- moves one live iframe wrapper between inline, a right-side panel for the
  protocol's `fullscreen` mode, and bounded picture-in-picture instead of
  recreating App state;
- exposes unobtrusive bottom-left Host controls only for display modes the App
  advertises through `appCapabilities.availableDisplayModes`.

The implementation uses the official `@modelcontextprotocol/ext-apps` `AppBridge` and `PostMessageTransport`.

## Other clients

The Host package is UI-neutral. The full HTML/AppBridge path is currently implemented only by the Web package. A TUI can install the Host independently and provide its own renderer (for example, a text fallback or “open in browser” action); terminal clients should not execute arbitrary App HTML inline.

[`@openma/dsh-agents-plugins-bridge`](https://github.com/openma-ai/dsh-agents-plugins)
uses this boundary directly: its Web profile gets the sandboxed renderer, while
its TUI profile keeps the shared MCP tools, resources, prompts, and backend
lifecycle without attempting to draw App HTML in the terminal.

## Related projects

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — Host,
  Loader, MCP client, and Web plugin platform.
- [Agent Plugins Bridge](https://github.com/openma-ai/dsh-agents-plugins) —
  one-package Codex, Claude Code, Pi, and Agent Plugins compatibility layer.
- [DeepSeek Harness TUI](https://github.com/openma-ai/deepseek-harness-tui) —
  terminal client for the same Host-side tools and commands.
- [DeepSeek Harness ACP](https://github.com/openma-ai/deepseek-harness-acp) —
  exposes Host capabilities to ACP clients.

## Development

Node.js 20 or newer is required.

```sh
npm install
npm run build
npm test
npm run typecheck
npm run test:browser
```

`test:browser` launches Playwright Chromium (or local Google Chrome on macOS) to verify the double-iframe origin and navigation boundary.

[`examples/display-modes`](./examples/display-modes) is a real stdio MCP
server built with the official MCP Apps server helpers and `App` client. Its
`display_modes` tool opens `ui://dsh/display-modes`; increment the counter and
switch through all three surfaces to verify that the App session remains live:

```sh
npm run build:example:display-modes
node examples/display-modes/server.mjs
```

## Compatibility

The Web renderer targets the `tool.call.takeover` chain present in current DSH
Web builds. When composed with DSH `0.1.0-rc.7`, its priority `-110` lets this
three-mode renderer claim an MCP App result before the bundled inline-only
renderer at priority `-100`. Other tool results continue down the ordinary
takeover chain.

Downloads, App-to-chat messages, and sampling are not enabled yet.

## License

[MIT](./LICENSE)
