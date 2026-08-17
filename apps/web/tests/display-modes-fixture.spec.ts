import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { describe, expect, it } from 'vitest'

const fixtureServer = fileURLToPath(new URL('../../../examples/display-modes/server.mjs', import.meta.url))

describe('display modes MCP App fixture', () => {
  it('serves a real App tool and ui:// HTML resource over stdio', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [fixtureServer],
      cwd: fileURLToPath(new URL('../../..', import.meta.url)),
      stderr: 'pipe',
    })
    const client = new Client({ name: 'display-modes-fixture-test', version: '1.0.0' })
    try {
      await client.connect(transport)
      const tools = await client.listTools()
      expect(tools.tools).toContainEqual(expect.objectContaining({
        name: 'display_modes',
        _meta: expect.objectContaining({
          ui: expect.objectContaining({ resourceUri: 'ui://dsh/display-modes' }),
        }),
      }))

      const result = await client.callTool({ name: 'display_modes', arguments: {} })
      expect(result).toMatchObject({
        content: [{ type: 'text', text: 'Opened the MCP Apps display mode fixture.' }],
        structuredContent: { counter: 0 },
        _meta: { ui: { resourceUri: 'ui://dsh/display-modes' } },
      })

      const resource = await client.readResource({ uri: 'ui://dsh/display-modes' })
      expect(resource.contents).toHaveLength(1)
      expect(resource.contents[0]).toMatchObject({
        uri: 'ui://dsh/display-modes',
        mimeType: 'text/html;profile=mcp-app',
        _meta: { ui: { prefersBorder: false } },
      })
      expect(resource.contents[0]?.text).toContain('id="mode-fullscreen"')
      expect(resource.contents[0]?.text).toContain('id="mode-pip"')
    } finally {
      await client.close().catch(() => undefined)
    }
  })
})
