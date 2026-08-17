import { describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import { McpAppView } from '../src/client/McpAppView.tsx'

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
    }

    await expect(Promise.resolve(apply(ctx as never))).resolves.toBeUndefined()
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
    }

    apply(ctx as never)

    expect(inject).toEqual(['slots', 'remote', 'remote.mcpApps'])
    expect(order).toEqual(['slot'])
    expect(registration).toMatchObject({
      name: 'tool.call.takeover',
      component: McpAppView,
      priority: -100,
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
    }
    await apply(ctx as never)
    const face = (registration?.inject as () => {
      callTool: (...args: unknown[]) => Promise<unknown>
    })()

    await expect(face.callTool('weather', 'refresh', {}, new AbortController().signal))
      .rejects.toThrow('server disconnected (not-connected)')
  })
})
