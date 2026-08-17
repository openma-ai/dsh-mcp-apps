import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { describe, expect, it, vi } from 'vitest'

interface ClientHandoff {
  id: string
  factory: (require: (id: string) => unknown) => {
    apply: (ctx: unknown) => Promise<void>
    inject: string[]
  }
}

describe('built MCP Apps Web client', () => {
  it('registers a self-contained DSH module that can mount its rc.6 Remote', async () => {
    const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
    let handoff: ClientHandoff | undefined
    const appendedStyles: Array<{ textContent?: string }> = []
    runInNewContext(source, {
      AbortController,
      Blob,
      DOMException,
      MessageChannel,
      TextDecoder,
      TextEncoder,
      URL,
      clearTimeout,
      console,
      crypto,
      document: {
        createElement: () => ({ dataset: {}, textContent: '' }),
        head: { appendChild: (node: { textContent?: string }) => appendedStyles.push(node) },
        querySelector: () => null,
      },
      setTimeout,
      window: {
        __ModuleLoader__: {
          load(value: ClientHandoff) { handoff = value },
        },
      },
    })

    expect(handoff?.id).toBe('@openma/dsh-mcp-apps-web')
    if (handoff === undefined) throw new Error('built client did not register a module factory')
    const requested: string[] = []
    const client = handoff.factory((id) => {
      requested.push(id)
      if (id === 'react') return React
      if (id === 'react/jsx-runtime') return jsxRuntime
      throw new Error(`unexpected external client dependency: ${id}`)
    })

    expect(requested).toEqual(['react', 'react/jsx-runtime'])
    expect(client.inject).toEqual(['slots', 'remote'])
    expect(client.apply).toBeTypeOf('function')
    expect(appendedStyles).toHaveLength(1)

    let contribution: { package?: string, descriptors?: unknown[] } | undefined
    const remote: Record<string, unknown> & { $mount: ReturnType<typeof vi.fn> } = {
      $mount: vi.fn(async (value: typeof contribution) => {
        contribution = value
        remote.mcpApps = { callTool: vi.fn(), readResource: vi.fn() }
        return async () => {}
      }),
    }
    const register = vi.fn(() => () => {})
    const ctx = {
      get: (name: string) => name === 'remote.mcpApps' ? remote.mcpApps : undefined,
      remote,
      slots: {
        inject: (_name: string, install: () => unknown) => install(),
        register,
      },
    }

    await client.apply(ctx)

    expect(remote.$mount).toHaveBeenCalledOnce()
    expect(contribution).toMatchObject({
      package: '@openma/dsh-mcp-apps-host',
      descriptors: [{ namespace: 'mcpApps', method: 'callTool' }, { namespace: 'mcpApps', method: 'readResource' }],
    })
    expect(register).toHaveBeenCalledOnce()
  })
})
