import { describe, expect, it } from 'vitest'
import type { ToolResultNode } from '@deepseek-ai/dsh-client-runtime/client'
import type { ToolCallOwnerProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { selectMcpApp } from '../src/client/payload.ts'

function owner(resultView: ToolResultNode['resultView']): ToolCallOwnerProps {
  return {
    callId: 'call-1',
    toolName: 'weather',
    block: {
      kind: 'tool-result',
      seq: 3,
      time: 3_000,
      callId: 'call-1',
      call: { name: 'weather', argsRaw: '{"city":"深圳"}' },
      callTime: 2_000,
      content: [],
      isError: false,
      callView: null,
      resultView,
      subCalls: [],
    },
    openFile: () => {},
  }
}

const appView = {
  card: 'mcp-app',
  serverName: 'weather-server',
  toolName: 'weather',
  resource: {
    uri: 'ui://weather/dashboard',
    mimeType: 'text/html;profile=mcp-app',
    text: '<!doctype html><html><body>Weather</body></html>',
    _meta: {
      ui: {
        csp: {
          connectDomains: [
            'https://api.example.com',
            "https://bad.example'; script-src *",
          ],
          resourceDomains: ['https://*.cdn.example.com'],
        },
        prefersBorder: true,
      },
    },
  },
  result: {
    content: [{ type: 'text', text: '24 C' }],
    structuredContent: { temperature: 24 },
  },
} as unknown as ToolResultNode['resultView']

describe('selectMcpApp', () => {
  it('accepts an exact ui resource and drops malformed CSP sources closed', () => {
    expect(selectMcpApp(owner(appView))).toEqual({
      serverName: 'weather-server',
      toolName: 'weather',
      arguments: { city: '深圳' },
      html: '<!doctype html><html><body>Weather</body></html>',
      csp: {
        connectDomains: ['https://api.example.com'],
        resourceDomains: ['https://*.cdn.example.com'],
      },
      prefersBorder: true,
      result: {
        content: [{ type: 'text', text: '24 C' }],
        structuredContent: { temperature: 24 },
      },
    })
  })

  it('declines non-App views and resources without the exact scheme and MIME', () => {
    expect(selectMcpApp(owner(null))).toBeNull()
    expect(selectMcpApp(owner({ card: 'generic' }))).toBeNull()

    const invalid = structuredClone(appView) as unknown as { resource: { uri: string; mimeType: string } }
    invalid.resource.uri = 'https://example.com/app.html'
    expect(selectMcpApp(owner(invalid as ToolResultNode['resultView']))).toBeNull()
    invalid.resource.uri = 'ui://weather/dashboard'
    invalid.resource.mimeType = 'text/html'
    expect(selectMcpApp(owner(invalid as ToolResultNode['resultView']))).toBeNull()
  })
})
