/** Client-safe MCP Apps Host API values. @module @openma/dsh-mcp-apps-host/types */

/** A losslessly JSON-serializable MCP value. */
export type McpJsonValue = null | boolean | number | string | McpJsonValue[] | { [key: string]: McpJsonValue }

/** A JSON object accepted as MCP method arguments or metadata. */
export type McpJsonObject = { [key: string]: McpJsonValue }

/** Raw successful or failed `tools/call` response forwarded to an MCP App. */
export interface McpCallToolResult {
  content: McpJsonValue[]
  structuredContent?: McpJsonValue
  isError?: boolean
  _meta?: McpJsonObject
}

/** One MCP resource content entry. */
export interface McpResourceContent {
  uri: string
  mimeType?: string
  text?: string
  blob?: string
  _meta?: McpJsonObject
}

/** Raw `resources/read` response forwarded to an MCP App. */
export interface McpReadResourceResult {
  contents: McpResourceContent[]
  _meta?: McpJsonObject
}

/** One advertised MCP resource. */
export interface McpResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
  _meta?: McpJsonObject
}

/** One page from `resources/list`. */
export interface McpListResourcesResult {
  resources: McpResource[]
  nextCursor?: string
  _meta?: McpJsonObject
}

/** One advertised MCP prompt. */
export interface McpPrompt {
  name: string
  title?: string
  description?: string
  arguments?: McpJsonValue[]
  _meta?: McpJsonObject
}

/** One page from `prompts/list`. */
export interface McpListPromptsResult {
  prompts: McpPrompt[]
  nextCursor?: string
  _meta?: McpJsonObject
}

/** Raw `prompts/get` response retained for non-model Host consumers. */
export interface McpGetPromptResult {
  description?: string
  messages: McpJsonValue[]
  _meta?: McpJsonObject
}

/** One live MCP server connection contributed to the Host registry. */
export interface McpConnectionProvider {
  readonly serverName: string
  callTool(name: string, args: McpJsonObject | undefined, signal?: AbortSignal): Promise<McpCallToolResult>
  readResource(uri: string, signal?: AbortSignal): Promise<McpReadResourceResult>
  listResources(cursor?: string, signal?: AbortSignal): Promise<McpListResourcesResult>
  listPrompts(cursor?: string, signal?: AbortSignal): Promise<McpListPromptsResult>
  getPrompt(name: string, args: McpJsonObject | undefined, signal?: AbortSignal): Promise<McpGetPromptResult>
}
