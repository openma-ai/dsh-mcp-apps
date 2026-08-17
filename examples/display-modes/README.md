# Display modes MCP App

This is a real stdio MCP server and a stateful MCP App built with the official
`@modelcontextprotocol/ext-apps` `App` client. The `display_modes` tool opens
one `ui://dsh/display-modes` resource that can request inline, fullscreen, and
picture-in-picture (`pip`) without remounting its iframe.

Build the browser App, then point a DSH MCP client row at the server:

```sh
npm run build:example:display-modes
node examples/display-modes/server.mjs
```

Example DSH row:

```yaml
- name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: display-modes
    transport: stdio
    command: node
    args:
      - /absolute/path/to/dsh-mcp-apps/examples/display-modes/server.mjs
```

Call `display_modes`, increment the counter, and switch surfaces. Returning a
floating surface to inline preserves the counter because the Host moves only
the wrapper state; the same sandbox iframe and AppBridge session stay alive.
