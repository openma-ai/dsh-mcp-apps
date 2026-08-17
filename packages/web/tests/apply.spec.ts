import { describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import mcpAppsRemote from '@openma/dsh-mcp-apps-host/remote'
import { apply, inject } from '../src/client/index.ts'
import { McpAppView } from '../src/client/McpAppView.tsx'

let loadedSlotRegistry: typeof SlotRegistry | undefined

async function loadSlotRegistry(): Promise<typeof SlotRegistry> {
  if (loadedSlotRegistry !== undefined) return loadedSlotRegistry
  let handoff: {
    factory: (require: (id: string) => unknown) => { SlotRegistry: typeof SlotRegistry }
  } | undefined
  const previousWindow = Reflect.get(globalThis, 'window')
  Reflect.set(globalThis, 'window', {
    __ModuleLoader__: {
      load(value: typeof handoff) { handoff = value },
    },
  })
  try {
    await import('@deepseek-ai/dsh-client-runtime/client')
  } finally {
    if (previousWindow === undefined) Reflect.deleteProperty(globalThis, 'window')
    else Reflect.set(globalThis, 'window', previousWindow)
  }
  if (handoff === undefined) throw new Error('client runtime did not register its module factory')
  const cordis = await import('@deepseek-ai/cordis')
  const uiSlots = await import('@deepseek-ai/dsh-client-ui-slots')
  loadedSlotRegistry = handoff.factory((id) => {
    if (id === '@deepseek-ai/cordis') return cordis
    if (id === '@deepseek-ai/dsh-client-ui-slots') return uiSlots
    throw new Error(`unexpected client runtime dependency: ${id}`)
  }).SlotRegistry
  return loadedSlotRegistry
}

describe('MCP Apps Web plugin', () => {
  it('consumes the composition-mounted Remote without mounting its descriptors again', async () => {
    const ctx = {
      slots: {
        inject: (_name: string, install: () => unknown) => install(),
        register: vi.fn(() => () => {}),
      },
      remote: {
        mcpApps: {
          callTool: vi.fn(),
          readResource: vi.fn(),
        },
        $mount: async () => {
          throw new Error('direct method mcpApps/callTool is already mounted')
        },
      },
      get: (name: string) => name === 'remote.mcpApps' ? ctx.remote.mcpApps : undefined,
    }

    await expect(Promise.resolve(apply(ctx as never))).resolves.toBeUndefined()
    expect(ctx.slots.register).toHaveBeenCalledOnce()
  })

  it('mounts the package Remote when the DSH composition does not provide mcpApps', async () => {
    const callTool = vi.fn()
    const readResource = vi.fn()
    const remote: Record<string, unknown> & { $mount: ReturnType<typeof vi.fn> } = {
      $mount: vi.fn(async (contribution: unknown) => {
        expect(contribution).toBe(mcpAppsRemote)
        remote.mcpApps = { callTool, readResource }
        return async () => {}
      }),
    }
    const ctx = {
      slots: {
        inject: (_name: string, install: () => unknown) => install(),
        register: vi.fn(() => () => {}),
      },
      remote,
      get: (name: string) => name === 'remote.mcpApps' ? remote.mcpApps : undefined,
    }

    await apply(ctx as never)

    expect(remote.$mount).toHaveBeenCalledOnce()
    expect(ctx.slots.register).toHaveBeenCalledOnce()
  })

  it('registers the Tool takeover against the composition-mounted Remote', () => {
    const order: string[] = []
    let registration: Record<string, unknown> | undefined
    const ctx = {
      slots: {
        inject: vi.fn((_name: string, install: () => unknown) => {
          order.push('slot')
          return install()
        }),
        register: vi.fn((options: Record<string, unknown>, component: unknown) => {
          registration = { ...options, component }
          return () => {}
        }),
      },
      remote: {
        mcpApps: {
          callTool: vi.fn(async () => ({
            ok: true,
            value: { content: [{ type: 'text', text: 'called' }] },
          })),
          readResource: vi.fn(async () => ({
            ok: true,
            value: { contents: [{ uri: 'ui://weather/state', text: '{}' }] },
          })),
        },
      },
      get: (name: string) => name === 'remote.mcpApps' ? ctx.remote.mcpApps : undefined,
    }

    apply(ctx as never)

    expect(inject).toEqual(['slots', 'remote'])
    expect(order).toEqual(['slot'])
    expect(registration).toMatchObject({
      name: 'tool.call.takeover',
      component: McpAppView,
      priority: -110,
    })
  })

  it('surfaces typed Remote failures to the AppBridge caller', async () => {
    let registration: Record<string, unknown> | undefined
    const ctx = {
      slots: {
        inject: (_name: string, install: () => unknown) => install(),
        register: (options: Record<string, unknown>) => {
          registration = options
          return () => {}
        },
      },
      remote: {
        mcpApps: {
          callTool: async () => ({
            ok: false,
            error: { code: 'not-connected', message: 'server disconnected', details: {} },
          }),
          readResource: vi.fn(),
        },
      },
      get: (name: string) => name === 'remote.mcpApps' ? ctx.remote.mcpApps : undefined,
    }
    await apply(ctx as never)
    const face = (registration?.inject as () => {
      callTool: (...args: unknown[]) => Promise<unknown>
    })()

    await expect(face.callTool('weather', 'refresh', {}, new AbortController().signal))
      .rejects.toThrow('server disconnected (not-connected)')
  })

  it('follows late Tool-slot declaration, declarer reload, and plugin teardown', async () => {
    const ctx = new Context()
    const SlotRegistry = await loadSlotRegistry()
    await ctx.plugin(SlotRegistry).await()
    class RemoteService extends Service {
      constructor(serviceCtx: Context) { super(serviceCtx, 'remote') }
    }
    new RemoteService(ctx)
    ctx.provide('remote.mcpApps', {
      callTool: vi.fn(),
      readResource: vi.fn(),
    })
    const slots = ctx.get('slots') as SlotRegistry
    const declare = () => slots.register({
      name: 'root',
      children: { 'tool.call.takeover': { kind: 'chain', scope: 'session' } },
    } as never, () => null)

    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(slots.entries('tool.call.takeover')).toHaveLength(0)

    const stop = declare()
    await vi.waitFor(() => {
      expect(slots.entries('tool.call.takeover')[0]?.component).toBe(McpAppView)
    })
    stop()
    expect(slots.entries('tool.call.takeover')).toHaveLength(0)
    declare()
    await vi.waitFor(() => {
      expect(slots.entries('tool.call.takeover')[0]?.component).toBe(McpAppView)
    })

    await fiber.dispose()
    expect(slots.entries('tool.call.takeover')).toHaveLength(0)
    await ctx.fiber.dispose()
  })

  it('orders ahead of the official inline renderer when both plugins are installed', async () => {
    const ctx = new Context()
    const SlotRegistry = await loadSlotRegistry()
    await ctx.plugin(SlotRegistry).await()
    class RemoteService extends Service {
      constructor(serviceCtx: Context) { super(serviceCtx, 'remote') }
    }
    new RemoteService(ctx)
    ctx.provide('remote.mcpApps', { callTool: vi.fn(), readResource: vi.fn() })
    const slots = ctx.get('slots') as SlotRegistry
    slots.register({
      name: 'root',
      children: { 'tool.call.takeover': { kind: 'chain', scope: 'session' } },
    } as never, () => null)
    const OfficialInlineRenderer = () => null
    slots.register({
      name: 'tool.call.takeover',
      priority: -100,
      select: () => ({ renderer: 'official-inline' }),
      inject: () => ({}),
    } as never, OfficialInlineRenderer)

    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()

    expect(slots.entries('tool.call.takeover').map(entry => ({
      component: entry.component,
      priority: entry.options.priority,
    }))).toEqual([
      { component: McpAppView, priority: -110 },
      { component: OfficialInlineRenderer, priority: -100 },
    ])

    await fiber.dispose()
    await ctx.fiber.dispose()
  })
})
