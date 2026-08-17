# dsh-mcp-apps

MCP Apps support for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness), packaged as ordinary Cordis plugins.

The project deliberately keeps the protocol host and each presentation surface separate. Installing the bundle adds two independent rows: a Host service that shares the existing MCP connection and a Web renderer that runs App HTML behind a double-iframe sandbox.

## Install

```sh
dsh plugin --profile web add @openma/dsh-mcp-apps
```

From a local checkout, install all three workspace packages in one command so
the bundle patch can resolve its local Host and Web rows:

```sh
dsh plugin --profile web add ./packages/host ./packages/web .
```

Use that full bundle only when DSH does not already provide the `mcpApps` Host
service. On a DSH composition that already includes `ctx.mcpApps` and the
generated `remote.mcpApps` namespace, do not activate this repository's Host
row a second time. Install only the Web renderer instead:

```sh
dsh plugin --profile web add ./packages/web
```

The renderer consumes the composition-provided Remote; it never mounts a
second copy of the Host descriptors.

The bundle patch expands to:

```yaml
- id: openma-mcp-apps-host
  name: '@openma/dsh-mcp-apps-host'

- id: openma-mcp-apps-web
  name: '@openma/dsh-mcp-apps-web'
```

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
| `@openma/dsh-mcp-apps` | Installable bundle; contains only the Cordis patch and package dependencies |
| `@openma/dsh-mcp-apps-host` | `ctx.mcpApps` provider registry plus the generated Typert Host/Remote contract |
| `@openma/dsh-mcp-apps-web` | Shape-driven Tool-result renderer, official AppBridge, and browser sandbox |

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
- bounds inline height requests to 96–720 px.

The implementation uses the official `@modelcontextprotocol/ext-apps` `AppBridge` and `PostMessageTransport`.

## Other clients

The Host package is UI-neutral. The full HTML/AppBridge path is currently implemented only by the Web package. A TUI can install the Host independently and provide its own renderer (for example, a text fallback or “open in browser” action); terminal clients should not execute arbitrary App HTML inline.

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

## Compatibility

The Web renderer targets the `tool.call.takeover` chain present on DSH main. The currently published DSH UI Tool declarations do not yet contain that slot, so this package carries a temporary declaration merge; the actual DSH runtime must include the takeover slot for MCP App cards to render.

The renderer currently advertises inline display mode only. Fullscreen, picture-in-picture, downloads, App-to-chat messages, and sampling are not enabled.

## License

[MIT](./LICENSE)
