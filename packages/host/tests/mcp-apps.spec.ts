import { describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
// Exercise the package artifact built by `pretest`; Vitest's transform does
// not parse the standard-decorator form used by Cordis services reliably.
import * as McpAppsModule from '../lib/index.js'

const signal = new AbortController().signal

function provider(serverName: string) {
  return {
    serverName,
    callTool: vi.fn(async () => ({
      content: [{ type: 'text', text: 'called' }],
      structuredContent: { count: 1 },
      _meta: { requestId: 'r1' },
    })),
    readResource: vi.fn(async () => ({
      contents: [{
        uri: 'ui://weather/app',
        mimeType: 'text/html;profile=mcp-app',
        text: '<!doctype html><title>Weather</title>',
        _meta: { ui: { prefersBorder: true } },
      }],
    })),
    listResources: vi.fn(async () => ({ resources: [] })),
    listPrompts: vi.fn(async () => ({ prompts: [] })),
    getPrompt: vi.fn(async () => ({ description: 'A prompt', messages: [] })),
  }
}

describe('McpAppsRuntime', () => {
  it('installs its runtime through the package plugin when the composition has none', async () => {
    const ctx = new Context()

    await ctx.plugin(McpAppsModule.default)

    expect(ctx.get('mcpApps')).toBeInstanceOf(McpAppsModule.McpAppsRuntime)
    await ctx.fiber.dispose()
  })

  it('leaves an official composition-provided mcpApps service in place', async () => {
    const ctx = new Context()
    class OfficialMcpApps extends Service {
      readonly marker = 'official'
      constructor(serviceCtx: Context) { super(serviceCtx, 'mcpApps') }
    }
    new OfficialMcpApps(ctx)

    await ctx.plugin(McpAppsModule.default).await()

    expect((ctx.get('mcpApps') as OfficialMcpApps).marker).toBe('official')
    await ctx.fiber.dispose()
  })

  it('routes AppBridge calls to the selected live server provider', async () => {
    expect(McpAppsModule.McpAppsRuntime).toBeDefined()
    const ctx = new Context()
    await ctx.plugin(McpAppsModule.McpAppsRuntime)
    const remote = ctx.mcpApps
    const live = provider('weather')
    remote.registerProvider(live)

    await expect(remote.callTool('weather', 'refresh', { city: 'Shanghai' }, signal)).resolves.toEqual({
      content: [{ type: 'text', text: 'called' }],
      structuredContent: { count: 1 },
      _meta: { requestId: 'r1' },
    })
    expect(live.callTool).toHaveBeenCalledWith('refresh', { city: 'Shanghai' }, signal)
  })

  it('routes resources and prompts through the same provider', async () => {
    const ctx = new Context()
    await ctx.plugin(McpAppsModule.McpAppsRuntime)
    const live = provider('weather')
    ctx.mcpApps.registerProvider(live)

    await expect(ctx.mcpApps.readResource('weather', 'ui://weather/app', signal))
      .resolves.toEqual(await live.readResource.mock.results[0]?.value)
    await ctx.mcpApps.listResources('weather', 'r-next', signal)
    await ctx.mcpApps.listPrompts('weather', 'p-next', signal)
    await ctx.mcpApps.getPrompt('weather', 'forecast', { unit: 'c' }, signal)

    expect(live.readResource).toHaveBeenCalledWith('ui://weather/app', signal)
    expect(live.listResources).toHaveBeenCalledWith('r-next', signal)
    expect(live.listPrompts).toHaveBeenCalledWith('p-next', signal)
    expect(live.getPrompt).toHaveBeenCalledWith('forecast', { unit: 'c' }, signal)
  })

  it('rejects non-UI resource reads from the AppBridge Remote method', async () => {
    const ctx = new Context()
    await ctx.plugin(McpAppsModule.McpAppsRuntime)
    const live = provider('weather')
    ctx.mcpApps.registerProvider(live)

    await expect(ctx.mcpApps.readResource('weather', 'file:///etc/passwd', signal))
      .rejects.toThrow('ui://')
    expect(live.readResource).not.toHaveBeenCalled()
  })

  it('fails loud for duplicate or missing server providers', async () => {
    const ctx = new Context()
    await ctx.plugin(McpAppsModule.McpAppsRuntime)
    ctx.mcpApps.registerProvider(provider('weather'))

    expect(() => ctx.mcpApps.registerProvider(provider('weather'))).toThrow('already registered')
    await expect(ctx.mcpApps.callTool('missing', 'refresh', {}, signal)).rejects.toThrow('not connected')
  })

  it('removes a provider when its registration is disposed', async () => {
    const ctx = new Context()
    await ctx.plugin(McpAppsModule.McpAppsRuntime)
    const dispose = ctx.mcpApps.registerProvider(provider('weather'))

    dispose()

    await expect(ctx.mcpApps.callTool('weather', 'refresh', {}, signal)).rejects.toThrow('not connected')
  })
})
