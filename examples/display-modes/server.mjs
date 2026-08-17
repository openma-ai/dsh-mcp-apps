#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from '@modelcontextprotocol/ext-apps/server'

const RESOURCE_URI = 'ui://dsh/display-modes'
const appJavaScript = (await readFile(new URL('./dist/app.js', import.meta.url), 'utf8'))
  .replaceAll('</script', '<\\/script')

const appHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>DSH MCP Apps display modes</title>
  <style>
    :root { color-scheme: light dark; font: 15px/1.45 ui-sans-serif, system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { min-height: 100vh; margin: 0; display: grid; place-items: center; color: #eef2ff; background: radial-gradient(circle at top left, #3949ab, #111827 64%); }
    main { width: min(680px, calc(100vw - 32px)); padding: 28px; border: 1px solid rgb(255 255 255 / 18%); border-radius: 24px; background: rgb(17 24 39 / 82%); box-shadow: 0 24px 80px rgb(0 0 0 / 32%); }
    .eyebrow { margin: 0 0 6px; color: #a5b4fc; font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    h1 { margin: 0; font-size: clamp(24px, 5vw, 42px); letter-spacing: -.04em; }
    .mode { margin: 8px 0 24px; color: #c7d2fe; }
    .counter { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px; border-radius: 16px; background: rgb(255 255 255 / 8%); }
    output { min-width: 3ch; color: white; font-size: 34px; font-weight: 750; text-align: center; }
    .actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 16px; }
    button { min-height: 42px; padding: 0 14px; border: 1px solid rgb(255 255 255 / 18%); border-radius: 12px; color: white; background: rgb(99 102 241 / 55%); font: inherit; font-weight: 650; cursor: pointer; }
    button:hover { background: rgb(129 140 248 / 75%); }
    #increment { background: #4f46e5; }
    .lifecycle { margin: 16px 0 0; color: #a5b4fc; font-size: 12px; }
    @media (max-width: 520px) { main { padding: 20px; } .actions { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main id="app" data-mode="inline" data-count="0" data-lifecycle="connecting">
    <p class="eyebrow">Real stdio MCP server · official App SDK</p>
    <h1>One App, three surfaces</h1>
    <p class="mode">Host mode: <strong id="current-mode">inline</strong></p>
    <section class="counter" aria-label="Persistent state probe">
      <span>Counter survives every mode switch</span>
      <output id="count">0</output>
      <button id="increment" type="button">Increment</button>
    </section>
    <nav class="actions" aria-label="Display modes">
      <button id="mode-inline" type="button">Inline</button>
      <button id="mode-fullscreen" type="button">Fullscreen</button>
      <button id="mode-pip" type="button">Picture in picture</button>
    </nav>
    <p class="lifecycle">Lifecycle: <span id="lifecycle">connecting</span></p>
  </main>
  <script>${appJavaScript}</script>
</body>
</html>`

const server = new McpServer({ name: 'dsh-display-modes-fixture', version: '1.0.0' })

registerAppTool(server, 'display_modes', {
  title: 'Open MCP Apps display modes fixture',
  description: 'Open one stateful MCP App that switches among inline, fullscreen, and picture-in-picture.',
  _meta: { ui: { resourceUri: RESOURCE_URI } },
}, async () => ({
  content: [{ type: 'text', text: 'Opened the MCP Apps display mode fixture.' }],
  structuredContent: { counter: 0 },
  _meta: { ui: { resourceUri: RESOURCE_URI } },
}))

registerAppResource(server, 'DSH display modes fixture', RESOURCE_URI, {
  description: 'Stateful MCP App used to validate all DSH Web display modes.',
  _meta: { ui: { prefersBorder: false } },
}, async () => ({
  contents: [{
    uri: RESOURCE_URI,
    mimeType: RESOURCE_MIME_TYPE,
    text: appHtml,
    _meta: { ui: { prefersBorder: false } },
  }],
}))

await server.connect(new StdioServerTransport())
