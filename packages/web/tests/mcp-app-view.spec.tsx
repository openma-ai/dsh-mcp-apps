// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js'
import type { McpAppMatch } from '../src/client/payload.ts'
import { McpAppView } from '../src/client/McpAppView.tsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const match: McpAppMatch = {
  serverName: 'weather-server',
  toolName: 'weather',
  arguments: { city: '深圳' },
  html: '<!doctype html><main>Weather</main>',
  csp: { connectDomains: ['https://api.example.com'] },
  prefersBorder: true,
  result: {
    content: [{ type: 'text', text: '24 C' }],
    structuredContent: { temperature: 24 },
  },
}

function message(source: MessageEventSource, data: unknown): void {
  window.dispatchEvent(new MessageEvent('message', { source, origin: 'null', data }))
}

describe('McpAppView', () => {
  it('runs the official AppBridge handshake through the opaque sandbox proxy', async () => {
    const callTool = vi.fn(async (): Promise<CallToolResult> => ({
      content: [{ type: 'text', text: 'refreshed' }],
    }))
    const readResource = vi.fn(async (): Promise<ReadResourceResult> => ({
      contents: [{ uri: 'ui://weather/state', mimeType: 'application/json', text: '{}' }],
    }))
    const view = render(<McpAppView matched={match} callTool={callTool} readResource={readResource} />)
    const iframe = view.getByTitle('weather MCP App') as HTMLIFrameElement
    const appWindow = iframe.contentWindow as Window
    const post = vi.spyOn(appWindow, 'postMessage').mockImplementation(() => {})

    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-forms')
    await waitFor(() => {
      expect(iframe.src.startsWith('data:text/html;base64,')).toBe(true)
    })

    act(() => {
      message(appWindow, {
        jsonrpc: '2.0',
        method: 'ui/notifications/sandbox-proxy-ready',
        params: {},
      })
    })
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        method: 'ui/notifications/sandbox-resource-ready',
        params: {
          html: '<!doctype html><main>Weather</main>',
          csp: { connectDomains: ['https://api.example.com'] },
        },
      }, '*')
    })

    act(() => {
      message(appWindow, {
        jsonrpc: '2.0',
        id: 1,
        method: 'ui/initialize',
        params: {
          protocolVersion: '2026-01-26',
          appCapabilities: {},
          appInfo: { name: 'weather-view', version: '1.0.0' },
        },
      })
      message(appWindow, {
        jsonrpc: '2.0',
        method: 'ui/notifications/initialized',
        params: {},
      })
    })

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(expect.objectContaining({
        method: 'ui/notifications/tool-input',
        params: { arguments: { city: '深圳' } },
      }), '*')
      expect(post).toHaveBeenCalledWith(expect.objectContaining({
        method: 'ui/notifications/tool-result',
        params: match.result,
      }), '*')
    })

    act(() => {
      message(appWindow, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'refresh', arguments: { city: '上海' } },
      })
      message(appWindow, {
        jsonrpc: '2.0',
        id: 3,
        method: 'resources/read',
        params: { uri: 'ui://weather/state' },
      })
    })

    await waitFor(() => {
      expect(callTool).toHaveBeenCalledWith(
        'weather-server', 'refresh', { city: '上海' }, expect.any(AbortSignal),
      )
      expect(readResource).toHaveBeenCalledWith(
        'weather-server', 'ui://weather/state', expect.any(AbortSignal),
      )
      expect(post).toHaveBeenCalledWith(expect.objectContaining({ id: 2, result: {
        content: [{ type: 'text', text: 'refreshed' }],
      } }), '*')
      expect(post).toHaveBeenCalledWith(expect.objectContaining({ id: 3, result: {
        contents: [{ uri: 'ui://weather/state', mimeType: 'application/json', text: '{}' }],
      } }), '*')
    })
  })

  it('bounds app-requested height and rejects unsafe link protocols', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const view = render(<McpAppView
      matched={match}
      callTool={vi.fn()}
      readResource={vi.fn()}
    />)
    const iframe = view.getByTitle('weather MCP App') as HTMLIFrameElement
    const appWindow = iframe.contentWindow as Window
    vi.spyOn(appWindow, 'postMessage').mockImplementation(() => {})

    act(() => {
      message(appWindow, {
        jsonrpc: '2.0',
        method: 'ui/notifications/size-changed',
        params: { height: 9_000 },
      })
      message(appWindow, {
        jsonrpc: '2.0',
        id: 4,
        method: 'ui/open-link',
        params: { url: 'javascript:alert(1)' },
      })
    })

    await waitFor(() => {
      expect(iframe.style.height).toBe('720px')
    })
    expect(open).not.toHaveBeenCalled()
  })
})
