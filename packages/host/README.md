# @openma/dsh-mcp-apps-host

UI-neutral MCP Apps Host service for DeepSeek Harness. MCP connection plugins register one provider per `serverName`; Host and Web consumers reuse that provider's live tools, resources, prompts, authentication, and reconnect generation through `ctx.mcpApps`.

The package exports:

- the Cordis service plugin from the package root;
- client-safe provider/result types from `@openma/dsh-mcp-apps-host/types`;
- generated Typert Host descriptors from `@openma/dsh-mcp-apps-host/typert`;
- generated browser Remote descriptors from `@openma/dsh-mcp-apps-host/remote`.

`callTool` and `readResource` are browser Remotes. Resource reads are restricted to `ui://`. `listResources`, `listPrompts`, and `getPrompt` remain same-process Host APIs.

Usually install the [`@openma/dsh-mcp-apps`](https://github.com/openma-ai/dsh-mcp-apps) bundle instead of this package directly.

MIT licensed.
