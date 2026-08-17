import { useEffect, useRef, useState } from 'react'
import {
  AppBridge,
  PostMessageTransport,
  type McpUiDisplayMode,
  type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps/app-bridge'
import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js'
import type { McpAppMatch } from './payload.ts'
import { sandboxProxyDataUrl } from './sandbox-proxy.ts'
import css from './McpAppView.module.css'

const MAX_INLINE_HEIGHT = 720
const MIN_INLINE_HEIGHT = 96
const AVAILABLE_DISPLAY_MODES: McpUiDisplayMode[] = ['inline', 'fullscreen', 'pip']

export interface McpAppViewProps {
  matched: McpAppMatch
  callTool: (
    serverName: string,
    name: string,
    args: Record<string, unknown> | undefined,
    signal: AbortSignal,
  ) => Promise<CallToolResult>
  readResource: (
    serverName: string,
    uri: string,
    signal: AbortSignal,
  ) => Promise<ReadResourceResult>
}

function theme(): 'light' | 'dark' {
  const matchMedia = (window as unknown as { matchMedia?: Window['matchMedia'] }).matchMedia
  return matchMedia?.call(window, '(prefers-color-scheme: dark)').matches === true ? 'dark' : 'light'
}

function safeExternalUrl(raw: string): URL {
  const url = new URL(raw)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`MCP App link protocol is not allowed: ${url.protocol}`)
  }
  return url
}

function hostContext(displayMode: McpUiDisplayMode): McpUiHostContext {
  return {
    theme: theme(),
    platform: 'web',
    locale: navigator.language,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    displayMode,
    availableDisplayModes: AVAILABLE_DISPLAY_MODES,
    containerDimensions: displayMode === 'inline'
      ? { maxHeight: MAX_INLINE_HEIGHT }
      : { width: window.innerWidth, height: window.innerHeight },
  }
}

/** Render one validated MCP App result behind the official AppBridge protocol. */
export function McpAppView({ matched, callTool, readResource }: McpAppViewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const bridgeRef = useRef<AppBridge | null>(null)
  const displayModeRef = useRef<McpUiDisplayMode>('inline')
  const [displayMode, setDisplayMode] = useState<McpUiDisplayMode>('inline')
  const changeDisplayMode = (mode: McpUiDisplayMode): void => {
    displayModeRef.current = mode
    setDisplayMode(mode)
    bridgeRef.current?.setHostContext(hostContext(mode))
  }

  useEffect(() => {
    const iframe = iframeRef.current
    if (iframe === null) return
    const origin = window.location.origin
    const bridge = new AppBridge(
      null,
      { name: 'dsh-web', version: '1.0.0' },
      {
        openLinks: {},
        serverTools: {},
        serverResources: {},
        sandbox: { ...matched.csp === undefined ? {} : { csp: matched.csp } },
      },
      {
        hostContext: hostContext('inline'),
      },
    )
    bridgeRef.current = bridge
    const transport = new PostMessageTransport(
      iframe.contentWindow as Window,
      iframe.contentWindow as Window,
    )
    let disposed = false
    let initialized = false

    bridge.oncalltool = async (params, extra) =>
      await callTool(matched.serverName, params.name, params.arguments, extra.signal)
    bridge.onreadresource = async (params, extra) =>
      await readResource(matched.serverName, params.uri, extra.signal)
    bridge.onopenlink = ({ url }) => {
      const external = safeExternalUrl(url)
      window.open(external.href, '_blank', 'noopener,noreferrer')
      return Promise.resolve({})
    }
    bridge.onrequestdisplaymode = async ({ mode }) => {
      changeDisplayMode(mode)
      return { mode }
    }
    bridge.addEventListener('sizechange', ({ height }) => {
      if (displayModeRef.current !== 'inline') return
      if (height === undefined || !Number.isFinite(height)) return
      const bounded = Math.min(MAX_INLINE_HEIGHT, Math.max(MIN_INLINE_HEIGHT, Math.round(height)))
      iframe.style.height = `${bounded}px`
    })
    bridge.addEventListener('sandboxready', () => {
      void bridge.sendSandboxResourceReady({
        html: matched.html,
        ...matched.csp === undefined ? {} : { csp: matched.csp },
      })
    })
    bridge.addEventListener('initialized', () => {
      initialized = true
      void bridge.sendToolInput(matched.arguments === undefined ? {} : { arguments: matched.arguments })
      void bridge.sendToolResult(matched.result)
    })

    void bridge.connect(transport).then(() => {
      if (!disposed) iframe.src = sandboxProxyDataUrl(origin, matched.csp)
    }).catch((error: unknown) => {
      console.error(`ui-mcp-app: AppBridge connection failed: ${String(error)}`)
    })

    return () => {
      disposed = true
      if (bridgeRef.current === bridge) bridgeRef.current = null
      if (initialized) {
        void bridge.teardownResource({}, { timeout: 250 })
          .catch((_viewAlreadyGone: unknown) => undefined)
      }
      void bridge.close()
    }
  }, [callTool, matched, readResource])

  return (
    <div
      className={css.root}
      data-border={matched.prefersBorder === false ? 'false' : 'true'}
      data-display-mode={displayMode}
    >
      {displayMode === 'inline' ? null : (
        <button
          type="button"
          className={css.modeClose}
          aria-label="Return MCP App inline"
          onClick={() => { changeDisplayMode('inline') }}
        >
          ×
        </button>
      )}
      <iframe
        ref={iframeRef}
        className={css.frame}
        title={`${matched.toolName} MCP App`}
        sandbox="allow-scripts allow-same-origin allow-forms"
        referrerPolicy="no-referrer"
      />
    </div>
  )
}
