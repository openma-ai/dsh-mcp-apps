import type { Context } from '@deepseek-ai/cordis'
import { createRequire } from 'node:module'

const requireFromBundle = createRequire(import.meta.url)

/** Mount one runtime package from this bundle's dependency graph. */
export async function mountOwnedDependency(
  ctx: Context,
  specifier: string,
  config: unknown,
): Promise<void> {
  const exports = await ctx.loader.import(requireFromBundle.resolve(specifier))
  const plugin = ctx.loader.unwrapExports(exports)
  await ctx.plugin(plugin, config)
}
