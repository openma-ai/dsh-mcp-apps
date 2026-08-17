// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  installSandboxProxy,
  sandboxProxyDataUrl,
} from '../src/client/sandbox-proxy.ts'

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

function dispatch(
  target: Window,
  source: MessageEventSource,
  origin: string,
  data: unknown,
): void {
  target.dispatchEvent(new MessageEvent('message', { source, origin, data }))
}

describe('MCP App sandbox proxy', () => {
  it('loads resource HTML behind a restrictive CSP and never embeds it in the outer URL', () => {
    const outer = document.createElement('iframe')
    document.body.append(outer)
    const proxyWindow = outer.contentWindow as Window
    const proxyDocument = outer.contentDocument as Document
    const hostPost = vi.spyOn(proxyWindow.parent, 'postMessage').mockImplementation(() => {})
    const policy = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' data:; font-src 'self'; connect-src https://api.example.com; frame-src 'none'; base-uri 'self'; object-src 'none'; form-action 'none'"
    const dispose = installSandboxProxy(proxyWindow, proxyDocument, window.location.origin, policy)

    const inner = proxyDocument.querySelector('iframe') as HTMLIFrameElement
    dispatch(proxyWindow, proxyWindow.parent, window.location.origin, {
      jsonrpc: '2.0',
      method: 'ui/notifications/sandbox-resource-ready',
      params: {
        html: '<!doctype html><script>window.loaded = true</script><main>Weather</main>',
        csp: { connectDomains: ['https://api.example.com'] },
      },
    })

    expect(inner.src.startsWith('data:text/html;charset=utf-8,')).toBe(true)
    const loaded = new DOMParser().parseFromString(
      decodeURIComponent(inner.src.slice(inner.src.indexOf(',') + 1)),
      'text/html',
    )
    expect(loaded.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content'))
      .toBe("default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' data:; font-src 'self'; connect-src https://api.example.com; frame-src 'none'; base-uri 'self'; object-src 'none'; form-action 'none'")
    expect(loaded.querySelector('main')?.textContent).toBe('Weather')
    expect(inner.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-forms')

    const url = sandboxProxyDataUrl(window.location.origin, {
      connectDomains: ['https://api.example.com'],
    })
    expect(url.startsWith('data:text/html;base64,')).toBe(true)
    const outerHtml = atob(url.slice(url.indexOf(',') + 1))
    expect(outerHtml).not.toContain('Weather')
    const outerDocument = new DOMParser().parseFromString(outerHtml, 'text/html')
    expect(outerDocument.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content'))
      .toContain('frame-src data:')
    expect(outerHtml.indexOf('Content-Security-Policy')).toBeLessThan(outerHtml.indexOf('<script>'))
    expect(hostPost).toHaveBeenCalledWith(expect.objectContaining({
      method: 'ui/notifications/sandbox-proxy-ready',
    }), window.location.origin)
    dispose()
  })

  it('relays only the exact parent and inner windows and blocks proxy-reserved methods', () => {
    const outer = document.createElement('iframe')
    document.body.append(outer)
    const proxyWindow = outer.contentWindow as Window
    const proxyDocument = outer.contentDocument as Document
    const hostPost = vi.spyOn(proxyWindow.parent, 'postMessage').mockImplementation(() => {})
    installSandboxProxy(proxyWindow, proxyDocument, window.location.origin, "default-src 'none'")
    const inner = proxyDocument.querySelector('iframe') as HTMLIFrameElement
    hostPost.mockClear()

    dispatch(proxyWindow, proxyWindow.parent, window.location.origin, {
      jsonrpc: '2.0',
      method: 'ui/notifications/sandbox-resource-ready',
      params: { html: '<!doctype html><main>App</main>' },
    })
    const loaded = new DOMParser().parseFromString(
      decodeURIComponent(inner.src.slice(inner.src.indexOf(',') + 1)),
      'text/html',
    )
    const bootstrap = loaded.querySelector('script')?.textContent ?? ''
    const generation = /const generation = "([a-f0-9]+)"/u.exec(bootstrap)?.[1]
    expect(generation).toMatch(/^[a-f0-9]{32}$/u)
    // JSDOM may replace an iframe's Window object asynchronously after a data
    // URL navigation. Pin one Window identity so this remains a relay test,
    // rather than a race against JSDOM's incomplete WindowProxy emulation.
    const innerPost = vi.fn()
    const innerWindow = { postMessage: innerPost } as unknown as Window
    Object.defineProperty(inner, 'contentWindow', { configurable: true, value: innerWindow })

    dispatch(proxyWindow, innerWindow, 'null', {
      jsonrpc: '2.0', method: 'ui/notifications/sandbox-inner-ready', params: { generation },
    })
    dispatch(proxyWindow, proxyWindow.parent, 'https://attacker.example', { jsonrpc: '2.0', method: 'ping' })
    dispatch(proxyWindow, proxyWindow.parent, window.location.origin, { jsonrpc: '2.0', method: 'ping' })
    dispatch(proxyWindow, innerWindow, 'null', { jsonrpc: '2.0', method: 'tools/call' })
    dispatch(proxyWindow, innerWindow, 'null', {
      jsonrpc: '2.0', method: 'ui/notifications/sandbox-inner-leaving', params: { generation },
    })
    dispatch(proxyWindow, innerWindow, 'null', {
      jsonrpc: '2.0', method: 'ui/notifications/sandbox-inner-ready', params: {},
    })
    dispatch(proxyWindow, proxyWindow.parent, window.location.origin, {
      jsonrpc: '2.0', method: 'ui/notifications/tool-result',
    })
    dispatch(proxyWindow, innerWindow, 'https://attacker.example', {
      jsonrpc: '2.0', method: 'resources/read',
    })
    dispatch(proxyWindow, innerWindow, 'null', {
      jsonrpc: '2.0',
      method: 'ui/notifications/sandbox-proxy-ready',
    })

    expect(innerPost).toHaveBeenCalledTimes(1)
    expect(innerPost).toHaveBeenCalledWith({ jsonrpc: '2.0', method: 'ping' }, '*')
    expect(hostPost).toHaveBeenCalledTimes(1)
    expect(hostPost).toHaveBeenCalledWith({ jsonrpc: '2.0', method: 'tools/call' }, window.location.origin)
  })

  it('buffers App handshake traffic until the initial document proves ready', () => {
    const outer = document.createElement('iframe')
    document.body.append(outer)
    const proxyWindow = outer.contentWindow as Window
    const proxyDocument = outer.contentDocument as Document
    const hostPost = vi.spyOn(proxyWindow.parent, 'postMessage').mockImplementation(() => {})
    installSandboxProxy(proxyWindow, proxyDocument, window.location.origin, "default-src 'none'")
    const inner = proxyDocument.querySelector('iframe') as HTMLIFrameElement
    hostPost.mockClear()

    dispatch(proxyWindow, proxyWindow.parent, window.location.origin, {
      jsonrpc: '2.0',
      method: 'ui/notifications/sandbox-resource-ready',
      params: { html: '<!doctype html><main>App</main>' },
    })
    const loaded = new DOMParser().parseFromString(
      decodeURIComponent(inner.src.slice(inner.src.indexOf(',') + 1)),
      'text/html',
    )
    const bootstrap = loaded.querySelector('script')?.textContent ?? ''
    const generation = /const generation = "([a-f0-9]+)"/u.exec(bootstrap)?.[1]
    const innerWindow = { postMessage: vi.fn() } as unknown as Window
    Object.defineProperty(inner, 'contentWindow', { configurable: true, value: innerWindow })

    const initialize = { jsonrpc: '2.0', id: 1, method: 'ui/initialize', params: {} }
    dispatch(proxyWindow, innerWindow, 'null', initialize)
    dispatch(proxyWindow, innerWindow, 'null', {
      jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'must-not-run' },
    })
    dispatch(proxyWindow, innerWindow, 'null', {
      jsonrpc: '2.0', method: 'notifications/message', params: { data: 'must-not-flush' },
    })
    expect(hostPost).not.toHaveBeenCalled()

    dispatch(proxyWindow, innerWindow, 'null', {
      jsonrpc: '2.0', method: 'ui/notifications/sandbox-inner-ready', params: { generation },
    })
    expect(hostPost).toHaveBeenCalledTimes(1)
    expect(hostPost).toHaveBeenCalledWith(initialize, window.location.origin)
  })
})
