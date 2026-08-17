import type { ToolCallOwnerProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { CallToolResultSchema, type CallToolResult } from '@modelcontextprotocol/sdk/types.js'

/** Validated MCP Apps Content Security Policy domain allowlists. */
export interface McpAppCsp {
  connectDomains?: string[]
  resourceDomains?: string[]
  frameDomains?: string[]
  baseUriDomains?: string[]
}

/** Complete, schema-validated payload handed to one sandboxed MCP App view. */
export interface McpAppMatch {
  serverName: string
  toolName: string
  arguments?: Record<string, unknown>
  html: string
  csp?: McpAppCsp
  prefersBorder?: boolean
  result: CallToolResult
}

const CSP_SOURCE = /^(?:https?|wss?):\/\/(?:\*\.)?[A-Za-z0-9.-]+(?::\d+)?$/

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function domains(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const accepted = value.filter((source): source is string =>
    typeof source === 'string' && CSP_SOURCE.test(source))
  return accepted.length > 0 ? accepted : undefined
}

function cspFrom(value: unknown): McpAppCsp | undefined {
  const source = record(value)
  if (source === undefined) return undefined
  const connectDomains = domains(source.connectDomains)
  const resourceDomains = domains(source.resourceDomains)
  const frameDomains = domains(source.frameDomains)
  const baseUriDomains = domains(source.baseUriDomains)
  const csp: McpAppCsp = {
    ...connectDomains === undefined ? {} : { connectDomains },
    ...resourceDomains === undefined ? {} : { resourceDomains },
    ...frameDomains === undefined ? {} : { frameDomains },
    ...baseUriDomains === undefined ? {} : { baseUriDomains },
  }
  return Object.keys(csp).length > 0 ? csp : undefined
}

function argumentsFrom(raw: string | undefined): Record<string, unknown> | undefined {
  if (raw === undefined) return undefined
  try {
    return record(JSON.parse(raw))
  } catch {
    return undefined
  }
}

/**
 * Select and narrow one wire Tool result into the complete sandbox input.
 * Invalid extension payloads decline to the normal Tool renderer.
 * @param owner - Frozen Tool call/result owner supplied by the takeover slot.
 * @returns A complete MCP App match, or `null` when normal Tool rendering should continue.
 */
export function selectMcpApp(owner: ToolCallOwnerProps): McpAppMatch | null {
  if (!('kind' in owner.block)) return null
  const view = record(owner.block.resultView)
  if (view?.card !== 'mcp-app') return null
  const serverName = nonEmptyString(view.serverName)
  const toolName = nonEmptyString(view.toolName)
  const resource = record(view.resource)
  const result = record(view.result)
  const uri = nonEmptyString(resource?.uri)
  const html = typeof resource?.text === 'string' ? resource.text : undefined
  if (
    serverName === undefined
    || toolName === undefined
    || uri === undefined
    || !uri.startsWith('ui://')
    || resource?.mimeType !== 'text/html;profile=mcp-app'
    || html === undefined
    || !Array.isArray(result?.content)
  ) return null

  const resourceMeta = record(resource._meta)
  const ui = record(resourceMeta?.ui)
  const parsedResult = CallToolResultSchema.safeParse(result)
  if (!parsedResult.success) return null
  const args = argumentsFrom(owner.block.call?.argsRaw)
  const csp = cspFrom(ui?.csp)
  return {
    serverName,
    toolName,
    ...args === undefined ? {} : { arguments: args },
    html,
    ...csp === undefined ? {} : { csp },
    ...typeof ui?.prefersBorder === 'boolean' ? { prefersBorder: ui.prefersBorder } : {},
    result: parsedResult.data,
  }
}
