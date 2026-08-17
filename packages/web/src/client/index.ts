/** Browser registration for sandboxed MCP Apps tool-result views. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import {
  CallToolResultSchema,
  ReadResourceResultSchema,
  type CallToolResult,
  type ReadResourceResult,
} from '@modelcontextprotocol/sdk/types.js'
import mcpAppsRemote from '@openma/dsh-mcp-apps-host/remote'
import type { McpJsonObject } from '@openma/dsh-mcp-apps-host/types'
import { McpAppView } from './McpAppView.tsx'
import { selectMcpApp } from './payload.ts'

export { McpAppView, type McpAppViewProps } from './McpAppView.tsx'
export { selectMcpApp, type McpAppCsp, type McpAppMatch } from './payload.ts'

/** Services required by the Tool takeover and generated MCP Apps Remote. */
export const inject = ['slots', 'remote']

/** Register the shape-driven Tool renderer over the available MCP Apps Remote. */
export async function apply(ctx: ClientContext): Promise<void> {
  if (ctx.get('remote.mcpApps') === undefined) await ctx.remote.$mount(mcpAppsRemote)
  ctx.slots.inject('tool.call.takeover', () => ctx.slots.register({
    name: 'tool.call.takeover',
    priority: -110,
    select: selectMcpApp,
    inject: () => ({
      callTool: async (
        serverName: string,
        name: string,
        args: Record<string, unknown> | undefined,
        signal: AbortSignal,
      ): Promise<CallToolResult> => {
        const outcome = await ctx.remote.mcpApps.callTool(
          serverName,
          name,
          args as McpJsonObject | undefined,
          signal,
        )
        if (!outcome.ok) throw new Error(`${outcome.error.message} (${outcome.error.code})`)
        return CallToolResultSchema.parse(outcome.value)
      },
      readResource: async (
        serverName: string,
        uri: string,
        signal: AbortSignal,
      ): Promise<ReadResourceResult> => {
        const outcome = await ctx.remote.mcpApps.readResource(serverName, uri, signal)
        if (!outcome.ok) throw new Error(`${outcome.error.message} (${outcome.error.code})`)
        return ReadResourceResultSchema.parse(outcome.value)
      },
    }),
  }, McpAppView))
}
