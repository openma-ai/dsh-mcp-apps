/**
 * Host registry and Remote methods for MCP Apps. Connection plugins register
 * one provider per server; every operation is routed to that provider so tools,
 * resources, and prompts reuse its single MCP SDK Client generation.
 * @module @openma/dsh-mcp-apps-host
 */

import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  McpCallToolResult,
  McpConnectionProvider,
  McpGetPromptResult,
  McpJsonObject,
  McpListPromptsResult,
  McpListResourcesResult,
  McpReadResourceResult,
} from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Live MCP connections addressable by server name. */
    mcpApps: McpAppsRuntime
  }
}

/** Registry and AppBridge Remote API for live MCP server connections. */
export class McpAppsRuntime extends TypertRemoteService {
  private readonly providers = new Map<string, McpConnectionProvider>()

  /** Register the service as `ctx.mcpApps` and Remote namespace `mcpApps`. */
  constructor(ctx: Context) {
    super(ctx, 'mcpApps')
  }

  /**
   * Register one live server provider. Duplicate server names fail before any
   * registry mutation; the returned disposer removes exactly this provider.
   * @param provider - Connection-backed tools/resources/prompts provider.
   * @returns Disposer for the provider contribution.
   */
  registerProvider(provider: McpConnectionProvider): () => void {
    if (this.providers.has(provider.serverName)) {
      throw new Error(`mcp-apps: server "${provider.serverName}" is already registered`)
    }
    const dispose = this.ctx.effect(function* (this: McpAppsRuntime) {
      this.providers.set(provider.serverName, provider)
      yield () => { this.providers.delete(provider.serverName) }
    }.bind(this), `mcp-apps.registerProvider(${provider.serverName})`)
    return () => { void dispose() }
  }

  /**
   * Call one App-visible tool on the selected server connection.
   * @param serverName - Server registry key captured from the app card.
   * @param name - Raw MCP tool name, never the model-facing qualified name.
   * @param args - Optional MCP tool arguments.
   * @param signal - Browser request cancellation.
   * @returns The raw MCP result, including structured content and metadata.
   */
  @Remote('callTool')
  async callTool(
    serverName: string,
    name: string,
    args?: McpJsonObject,
    signal?: AbortSignal,
  ): Promise<McpCallToolResult> {
    return await this.requireProvider(serverName).callTool(name, args, signal)
  }

  /**
   * Read one UI resource from the selected server connection.
   * @param serverName - Server registry key captured from the app card.
   * @param uri - App resource URI; Remote callers are restricted to `ui://`.
   * @param signal - Browser request cancellation.
   * @returns The raw MCP resource response.
   */
  @Remote('readResource')
  async readResource(serverName: string, uri: string, signal?: AbortSignal): Promise<McpReadResourceResult> {
    if (!uri.startsWith('ui://')) throw new Error('mcp-apps: AppBridge resource URI must use ui://')
    return await this.requireProvider(serverName).readResource(uri, signal)
  }

  /**
   * List resources through a server's shared connection for Host consumers.
   * @param serverName - Server registry key.
   * @param cursor - Optional MCP pagination cursor.
   * @param signal - Request cancellation.
   * @returns One MCP resource page.
   */
  listResources(serverName: string, cursor?: string, signal?: AbortSignal): Promise<McpListResourcesResult> {
    return this.requireProvider(serverName).listResources(cursor, signal)
  }

  /**
   * List prompts through a server's shared connection for Host consumers.
   * @param serverName - Server registry key.
   * @param cursor - Optional MCP pagination cursor.
   * @param signal - Request cancellation.
   * @returns One MCP prompt page.
   */
  listPrompts(serverName: string, cursor?: string, signal?: AbortSignal): Promise<McpListPromptsResult> {
    return this.requireProvider(serverName).listPrompts(cursor, signal)
  }

  /**
   * Resolve a prompt through a server's shared connection for Host consumers.
   * @param serverName - Server registry key.
   * @param name - Raw MCP prompt name.
   * @param args - Optional string-valued prompt arguments represented as JSON.
   * @param signal - Request cancellation.
   * @returns The raw MCP prompt response.
   */
  getPrompt(
    serverName: string,
    name: string,
    args?: McpJsonObject,
    signal?: AbortSignal,
  ): Promise<McpGetPromptResult> {
    return this.requireProvider(serverName).getPrompt(name, args, signal)
  }

  private requireProvider(serverName: string): McpConnectionProvider {
    const provider = this.providers.get(serverName)
    if (provider === undefined) throw new Error(`mcp-apps: server "${serverName}" is not connected`)
    return provider
  }
}

export default McpAppsRuntime
