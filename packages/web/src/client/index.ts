/** Browser registration for sandboxed MCP Apps tool-result views. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import {
  CallToolResultSchema,
  ReadResourceResultSchema,
  type CallToolResult,
  type ReadResourceResult,
} from '@modelcontextprotocol/sdk/types.js'
// Type-only: merges the composition-generated `mcpApps` namespace into the
// Client Remote face without mounting its runtime descriptors again.
import type {} from '@openma/dsh-mcp-apps-host/remote'
import type { McpJsonObject } from '@openma/dsh-mcp-apps-host/types'
import { McpAppView } from './McpAppView.tsx'
import { selectMcpApp } from './payload.ts'

export { McpAppView, type McpAppViewProps } from './McpAppView.tsx'
export { selectMcpApp, type McpAppCsp, type McpAppMatch } from './payload.ts'

/** Services required by the Tool takeover and generated MCP Apps Remote. */
export const inject = ['slots', 'remote', 'remote.mcpApps']

/** Register the shape-driven Tool renderer over the composition-mounted Remote. */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('tool.call.takeover', () => ctx.slots.register({
    name: 'tool.call.takeover',
    priority: -100,
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
