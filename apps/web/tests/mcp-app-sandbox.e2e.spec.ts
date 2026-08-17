import { existsSync } from 'node:fs'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { sandboxProxyDataUrl } from '../../../packages/web/src/client/sandbox-proxy.ts'

// Real-browser lifecycle coverage; the default Vitest project selects *.spec.ts.

let browser: Browser

beforeAll(async () => {
  const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  browser = await chromium.launch(existsSync(systemChrome) ? { executablePath: systemChrome } : {})
})

afterAll(async () => {
  await browser.close()
}, 30_000)

async function hostPage(): Promise<Page> {
  const page = await browser.newPage()
  await page.route('http://host.test/**', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><title>MCP App sandbox probe</title>',
  }))
  await page.goto('http://host.test/')
  return page
}

it('starts the outer proxy after its document body exists', async () => {
  const page = await hostPage()
  const method = await page.evaluate(proxyUrl => new Promise<string>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('sandbox proxy timed out'))
    }, 5_000)
    const outer = document.createElement('iframe')
    outer.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms')
    window.addEventListener('message', (event) => {
      if (event.source !== outer.contentWindow) return
      window.clearTimeout(timer)
      const data: unknown = event.data
      const method = typeof data === 'object'
        && data !== null
        && typeof (data as { method?: unknown }).method === 'string'
        ? (data as { method: string }).method
        : ''
      resolve(method)
    })
    outer.src = proxyUrl
    document.body.append(outer)
  }), sandboxProxyDataUrl('http://host.test'))
  expect(method).toBe('ui/notifications/sandbox-proxy-ready')
  await page.close()
})

/**
 * A data-URL App document needs its own opaque origin. If it is instead
 * document-written into the proxy's initial about:blank, both frames inherit
 * the same opaque origin and arbitrary App code can edit the trusted relay.
 */
it('keeps MCP App code out of the outer proxy document', async () => {
  const page = await hostPage()
  try {
    const browserErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(message.text())
    })
    page.on('pageerror', (error) => {
      browserErrors.push(error.message)
    })

    const result = await page.evaluate(proxyUrl => new Promise<boolean>((resolve, reject) => {
      const record = (value: unknown): Record<string, unknown> | undefined =>
        typeof value === 'object' && value !== null
          ? value as Record<string, unknown>
          : undefined
      const timer = window.setTimeout(() => {
        reject(new Error('sandbox probe timed out'))
      }, 5_000)
      const outer = document.createElement('iframe')
      outer.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms')
      window.addEventListener('message', (event) => {
        if (event.source !== outer.contentWindow) return
        const data = record(event.data)
        if (data?.method === 'ui/notifications/sandbox-proxy-ready') {
          outer.contentWindow?.postMessage({
            jsonrpc: '2.0',
            method: 'ui/notifications/sandbox-resource-ready',
            params: {
              html: `<!doctype html><script>
                let reachedProxy = false
                try {
                  parent.document.body.dataset.appOwned = 'true'
                  reachedProxy = parent.document.body.dataset.appOwned === 'true'
                } catch {}
                addEventListener('load', () => setTimeout(() => parent.postMessage({
                  jsonrpc: '2.0', method: 'probe', params: { reachedProxy }
                }, '*')))
              </script>`,
            },
          }, '*')
          return
        }
        if (data?.method !== 'probe') return
        window.clearTimeout(timer)
        resolve(record(data.params)?.reachedProxy === true)
      })
      outer.src = proxyUrl
      document.body.append(outer)
    }), sandboxProxyDataUrl('http://host.test')).catch(async (error: unknown) => {
      const frames = await Promise.all(page.frames().map(async frame => ({
        url: frame.url(),
        html: await frame.locator('html').evaluate(element => element.outerHTML).catch(() => '<unreadable>'),
      })))
      throw new Error(`${String(error)}; browser errors: ${browserErrors.join(' | ')}; frames: ${JSON.stringify(frames)}`)
    })

    expect(result).toBe(false)
  } finally {
    await page.close()
  }
}, 30_000)

it('does not reopen host forwarding after an App self-navigates away from its CSP', async () => {
  const page = await hostPage()
  try {
    const navigatedHtml = `<!doctype html><title>mcp-app-replaced-document</title><script>
    addEventListener('message', (event) => {
      if (event.data?.method !== 'host/secret') return
      parent.postMessage({ jsonrpc: '2.0', method: 'probe/secret-received' }, '*')
    })
    parent.postMessage({
      jsonrpc: '2.0',
      method: 'ui/notifications/sandbox-inner-ready',
      params: {}
    }, '*')
  </script>`
    const navigatedUrl = `data:text/html;charset=utf-8,${encodeURIComponent(navigatedHtml)}`
    const escapedNavigation = JSON.stringify(navigatedUrl)
    const appHtml = `<!doctype html><script>location.href = ${escapedNavigation}</script>`
    const navigated = page.waitForEvent('framenavigated', {
      predicate: frame => frame.url() === navigatedUrl,
      timeout: 10_000,
    })

    await page.evaluate(({ proxyUrl, html }) => {
      const state = window as unknown as { mcpAppReceivedSecret?: boolean }
      state.mcpAppReceivedSecret = false
      const outer = document.createElement('iframe')
      outer.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms')
      window.addEventListener('message', (event) => {
        if (event.source !== outer.contentWindow) return
        const data: unknown = event.data
        const method = typeof data === 'object' && data !== null
          ? (data as { method?: unknown }).method
          : undefined
        if (method === 'probe/secret-received') {
          state.mcpAppReceivedSecret = true
          return
        }
        if (method !== 'ui/notifications/sandbox-proxy-ready') return
        outer.contentWindow?.postMessage({
          jsonrpc: '2.0',
          method: 'ui/notifications/sandbox-resource-ready',
          params: { html },
        }, '*')
      })
      outer.src = proxyUrl
      document.body.append(outer)
    }, { proxyUrl: sandboxProxyDataUrl('http://host.test'), html: appHtml })

    await navigated
    await page.evaluate(() => {
      document.querySelector('iframe')?.contentWindow?.postMessage({
        jsonrpc: '2.0',
        method: 'host/secret',
        params: { value: 'must-not-leak' },
      }, '*')
    })
    await page.waitForTimeout(300)

    await expect(page.evaluate(() =>
      (window as unknown as { mcpAppReceivedSecret?: boolean }).mcpAppReceivedSecret)).resolves.toBe(false)
  } finally {
    await page.close()
  }
}, 30_000)
