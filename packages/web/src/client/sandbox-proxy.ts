import type { McpAppCsp } from './payload.ts'

const CSP_SOURCE = /^(?:https?|wss?):\/\/(?:\*\.)?[A-Za-z0-9.-]+(?::\d+)?$/

function acceptedSources(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && CSP_SOURCE.test(item))
    : []
}

function sources(values: string[], fallback: string): string {
  return values.length === 0 ? fallback : values.join(' ')
}

/** Resource-derived policy installed on the untrusted App document. */
function sandboxPolicy(value: McpAppCsp | undefined): string {
  const connect = acceptedSources(value?.connectDomains)
  const resources = acceptedSources(value?.resourceDomains)
  const frames = acceptedSources(value?.frameDomains)
  const bases = acceptedSources(value?.baseUriDomains)
  const resourceSuffix = resources.length === 0 ? '' : ` ${resources.join(' ')}`
  return [
    "default-src 'none'",
    `script-src 'self' 'unsafe-inline'${resourceSuffix}`,
    `style-src 'self' 'unsafe-inline'${resourceSuffix}`,
    `img-src 'self' data:${resourceSuffix}`,
    `media-src 'self' data:${resourceSuffix}`,
    `font-src 'self'${resourceSuffix}`,
    `connect-src ${sources(connect, "'none'")}`,
    `frame-src ${sources(frames, "'none'")}`,
    `base-uri ${sources(bases, "'self'")}`,
    "object-src 'none'",
    "form-action 'none'",
  ].join('; ')
}

/** The proxy itself needs only inline bootstrap code and one data-URL child. */
const PROXY_POLICY = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'frame-src data:',
  "object-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ')

/**
 * Install the outer half of the MCP Apps double-iframe sandbox. The function
 * is closure-free because its runtime source is embedded in a data URL, giving
 * the proxy an opaque origin distinct from the host without a second server.
 * @param proxyWindow - Opaque-origin outer iframe window that mediates messages.
 * @param proxyDocument - Outer iframe document that will own the inner sandbox.
 * @param expectedHostOrigin - Exact dsh Web origin accepted as the Host parent.
 * @param policy - Prevalidated resource CSP installed on the inner App document.
 * @returns Disposer that removes the message listener and inner iframe.
 */
export function installSandboxProxy(
  proxyWindow: Window,
  proxyDocument: Document,
  expectedHostOrigin: string,
  policy: string,
): () => void {
  if (proxyWindow === proxyWindow.top) throw new Error('MCP App sandbox proxy must be framed')

  const inner = proxyDocument.createElement('iframe')
  inner.style.cssText = 'display:block;width:100%;height:100%;border:0'
  inner.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms')
  proxyDocument.body.replaceChildren(inner)

  const resourceReady = 'ui/notifications/sandbox-resource-ready'
  const innerReady = 'ui/notifications/sandbox-inner-ready'
  const innerLeaving = 'ui/notifications/sandbox-inner-leaving'
  const reservedPrefix = 'ui/notifications/sandbox-'
  let activeGeneration: string | undefined
  let forwardsHostData = false
  const stopForwardingOnNavigation = (): void => {
    forwardsHostData = false
  }
  inner.addEventListener('load', stopForwardingOnNavigation)
  const methodOf = (value: unknown): string | undefined => {
    if (typeof value !== 'object' || value === null) return undefined
    const method = (value as Record<string, unknown>).method
    return typeof method === 'string' ? method : undefined
  }

  const listener = (event: MessageEvent): void => {
    const method = methodOf(event.data)
    if (event.source === proxyWindow.parent) {
      if (event.origin !== expectedHostOrigin) return
      if (method === resourceReady) {
        const envelope = event.data as { params?: { html?: unknown } }
        if (typeof envelope.params?.html !== 'string') return
        const loaded = new DOMParser().parseFromString(envelope.params.html, 'text/html')
        const random = new Uint32Array(4)
        proxyWindow.crypto.getRandomValues(random)
        const generation = Array.from(random, value => value.toString(16).padStart(8, '0')).join('')
        const meta = loaded.createElement('meta')
        meta.httpEquiv = 'Content-Security-Policy'
        meta.content = policy
        const bootstrap = loaded.createElement('script')
        bootstrap.textContent = `{
          const generation = ${JSON.stringify(generation)}
          const send = parent.postMessage.bind(parent)
          document.currentScript?.remove()
          addEventListener('load', () => setTimeout(() => send({
            jsonrpc: '2.0', method: '${innerReady}', params: { generation }
          }, '*')), { once: true })
          addEventListener('pagehide', () => send({
            jsonrpc: '2.0', method: '${innerLeaving}', params: { generation }
          }, '*'), { once: true })
        }`
        loaded.head.prepend(bootstrap)
        loaded.head.prepend(meta)
        activeGeneration = generation
        forwardsHostData = false
        inner.src = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>${loaded.documentElement.outerHTML}`)}`
        return
      }
      if (method?.startsWith(reservedPrefix) === true) return
      if (!forwardsHostData) return
      inner.contentWindow?.postMessage(event.data, '*')
      return
    }
    if (event.source !== inner.contentWindow || event.origin !== 'null') return
    const params = typeof event.data === 'object' && event.data !== null
      ? (event.data as { params?: unknown }).params
      : undefined
    const generation = typeof params === 'object' && params !== null
      ? (params as { generation?: unknown }).generation
      : undefined
    if (method === innerReady) {
      if (activeGeneration === undefined || generation !== activeGeneration) return
      forwardsHostData = true
      return
    }
    if (method === innerLeaving) {
      if (activeGeneration === undefined || generation !== activeGeneration) return
      forwardsHostData = false
      activeGeneration = undefined
      return
    }
    if (method?.startsWith(reservedPrefix) === true || !forwardsHostData) return
    proxyWindow.parent.postMessage(event.data, expectedHostOrigin)
  }
  proxyWindow.addEventListener('message', listener)
  proxyWindow.parent.postMessage({
    jsonrpc: '2.0',
    method: 'ui/notifications/sandbox-proxy-ready',
    params: {},
  }, expectedHostOrigin)

  return () => {
    proxyWindow.removeEventListener('message', listener)
    inner.removeEventListener('load', stopForwardingOnNavigation)
    inner.remove()
  }
}

/**
 * Create the opaque-origin document URL for one outer sandbox proxy.
 * @param expectedHostOrigin - Exact dsh Web origin embedded into the proxy guard.
 * @param csp - Validated MCP resource domains enforced on the inner App document.
 * @returns A data URL containing proxy code but no MCP resource HTML.
 */
export function sandboxProxyDataUrl(expectedHostOrigin: string, csp?: McpAppCsp): string {
  const policy = sandboxPolicy(csp)
  const invocation = `(${installSandboxProxy.toString()})(window,document,${JSON.stringify(expectedHostOrigin)},${JSON.stringify(policy)})`
  const escapedPolicy = PROXY_POLICY.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  const document = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${escapedPolicy}"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}</style><body><script>${invocation}</script>`
  return `data:text/html;base64,${btoa(document)}`
}
