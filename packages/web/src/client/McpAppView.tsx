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
const SIDE_PANEL_WIDTH = 720
const PIP_WIDTH = 420
const PIP_HEIGHT = 320
const NARROW_VIEWPORT = 640
const AVAILABLE_DISPLAY_MODES: McpUiDisplayMode[] = ['inline', 'fullscreen', 'pip']
const DISPLAY_MODE_LABELS: Record<McpUiDisplayMode, string> = {
  inline: 'Show MCP App inline',
  fullscreen: 'Open MCP App in side panel',
  pip: 'Open MCP App in picture in picture',
}

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
  const compactInset = window.innerWidth <= NARROW_VIEWPORT ? 24 : 32
  const containerDimensions = displayMode === 'inline'
    ? { maxHeight: MAX_INLINE_HEIGHT }
    : displayMode === 'fullscreen'
      ? { width: Math.min(SIDE_PANEL_WIDTH, window.innerWidth), height: window.innerHeight }
      : {
          width: Math.max(0, Math.min(PIP_WIDTH, window.innerWidth - compactInset)),
          height: Math.max(0, Math.min(PIP_HEIGHT, window.innerHeight - compactInset)),
        }
  return {
    theme: theme(),
    platform: 'web',
    locale: navigator.language,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    displayMode,
    availableDisplayModes: AVAILABLE_DISPLAY_MODES,
    containerDimensions,
  }
}

function DisplayModeIcon({ mode }: { mode: McpUiDisplayMode }) {
  if (mode === 'inline') {
    return (
      <svg aria-hidden="true" className={css.hostIcon} viewBox="0 0 16 16">
        <path d="m4.5 4.5 7 7m0-7-7 7" />
      </svg>
    )
  }
  if (mode === 'fullscreen') {
    return (
      <svg aria-hidden="true" className={css.hostIcon} viewBox="0 0 16 16">
        <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="1.5" />
        <path d="M9.5 2.75v10.5" />
      </svg>
    )
  }
  return (
    <svg aria-hidden="true" className={css.pipIcon} viewBox="0 0 16 16">
      <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="1.5" />
      <rect x="7.25" y="7.25" width="4.5" height="3.75" rx=".75" />
    </svg>
  )
}

/** Render one validated MCP App result behind the official AppBridge protocol. */
export function McpAppView({ matched, callTool, readResource }: McpAppViewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const bridgeRef = useRef<AppBridge | null>(null)
  const displayModeRef = useRef<McpUiDisplayMode>('inline')
  const appDisplayModesRef = useRef<McpUiDisplayMode[]>(['inline'])
  const [displayMode, setDisplayMode] = useState<McpUiDisplayMode>('inline')
  const [appDisplayModes, setAppDisplayModes] = useState<McpUiDisplayMode[]>([])
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
      if (!appDisplayModesRef.current.includes(mode)) return { mode: displayModeRef.current }
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
      const declaredModes = bridge.getAppCapabilities()?.availableDisplayModes ?? []
      const mutualModes = AVAILABLE_DISPLAY_MODES.filter(mode =>
        mode === 'inline' || declaredModes.includes(mode))
      appDisplayModesRef.current = mutualModes
      setAppDisplayModes(mutualModes)
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

  const modeActions = appDisplayModes.filter(mode => mode !== displayMode)

  return (
    <div
      className={css.root}
      data-border={matched.prefersBorder === false ? 'false' : 'true'}
      data-display-mode={displayMode}
      data-host-surface={displayMode === 'fullscreen' ? 'side-panel' : displayMode}
    >
      <iframe
        ref={iframeRef}
        className={css.frame}
        title={`${matched.toolName} MCP App`}
        sandbox="allow-scripts allow-same-origin allow-forms"
        referrerPolicy="no-referrer"
      />
      {modeActions.length === 0 ? null : (
        <div className={css.modeControls} role="toolbar" aria-label="MCP App display">
          {modeActions.map(mode => (
            <button
              key={mode}
              type="button"
              className={css.modeButton}
              aria-label={DISPLAY_MODE_LABELS[mode]}
              title={DISPLAY_MODE_LABELS[mode]}
              onClick={() => { changeDisplayMode(mode) }}
            >
              <DisplayModeIcon mode={mode} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
