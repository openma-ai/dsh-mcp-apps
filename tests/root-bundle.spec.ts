import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.js'

interface Row {
  readonly id: string
  readonly name: string
}

function harness(existing: Row[] = []) {
  const store: Record<string, Row | undefined> = Object.fromEntries(existing.map(row => [row.id, row]))
  const created: Row[] = []
  const removed: string[] = []
  const ctx = {
    effect: async (factory: () => Promise<() => Promise<void>>) => factory(),
    loader: {
      store,
      create: async (row: Row) => {
        created.push(row)
        store[row.id] = row
        return row.id
      },
      remove: async (id: string) => {
        removed.push(id)
        delete store[id]
      },
    },
  }
  return { ctx, created, removed }
}

describe('nestable MCP Apps bundle plugin', () => {
  it('mounts Host and Web as separately owned child rows', async () => {
    const bench = harness()
    const dispose = await apply(bench.ctx as never)

    expect(bench.created).toEqual([
      { id: 'mcp-apps-host', name: '@openma/dsh-mcp-apps/host' },
      { id: 'mcp-apps-web', name: '@openma/dsh-mcp-apps/web' },
    ])

    await dispose?.()
    expect(bench.removed).toEqual(['mcp-apps-web', 'mcp-apps-host'])
  })

  it('reuses children owned by another bundle row without removing them', async () => {
    const host = { id: 'mcp-apps-host', name: '@openma/dsh-mcp-apps/host' }
    const bench = harness([host])
    const dispose = await apply(bench.ctx as never)

    expect(bench.created).toEqual([
      { id: 'mcp-apps-web', name: '@openma/dsh-mcp-apps/web' },
    ])
    await dispose?.()
    expect(bench.removed).toEqual(['mcp-apps-web'])
    expect(bench.ctx.loader.store['mcp-apps-host']).toBe(host)
  })

  it('does not leak a slower child when a sibling creation fails', async () => {
    const store: Record<string, Row | undefined> = {}
    const removed: string[] = []
    const ctx = {
      effect: async (factory: () => Promise<() => Promise<void>>) => factory(),
      loader: {
        store,
        create: async (row: Row) => {
          if (row.id === 'mcp-apps-web') throw new Error('web failed')
          await new Promise(resolve => setTimeout(resolve, 10))
          store[row.id] = row
          return row.id
        },
        remove: async (id: string) => {
          removed.push(id)
          delete store[id]
        },
      },
    }

    await expect(apply(ctx as never)).rejects.toThrow('web failed')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(store).toEqual({})
    expect(removed).toEqual(['mcp-apps-host'])
  })
})
