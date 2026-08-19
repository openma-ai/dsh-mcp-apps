import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'

const CHILD_ROWS = [
  { id: 'mcp-apps-host', name: '@openma/dsh-mcp-apps/host' },
  { id: 'mcp-apps-web', name: '@openma/dsh-mcp-apps/web' },
] as const

export const name = 'mcp-apps-bundle'
export const inject = ['loader']

/** Mount the Host and Web capabilities as independently disposable child plugins. */
export function apply(ctx: Context): ReturnType<Context['effect']> {
  return ctx.effect(async () => {
    const owned: string[] = []
    const unmount = async () => {
      for (const id of [...owned].reverse()) {
        if (ctx.loader.store[id] !== undefined) await ctx.loader.remove(id)
      }
    }
    try {
      for (const row of CHILD_ROWS) {
        if (ctx.loader.store[row.id] !== undefined) continue
        owned.push(row.id)
        await ctx.loader.create(row)
      }
    } catch (cause) {
      await unmount()
      throw cause
    }
    return unmount
  }, 'mcp-apps: Host and Web child plugins')
}
