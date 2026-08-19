import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { it } from 'vitest'

const requireFromPackage = createRequire(new URL('../package.json', import.meta.url))

for (const fixture of [
  {
    entry: '../src/host.js',
    dependency: '@openma/dsh-mcp-apps-host',
    name: 'mcp-apps-host-wrapper',
  },
  {
    entry: '../src/web.js',
    dependency: '@openma/dsh-mcp-apps-web',
    name: 'mcp-apps-web-wrapper',
  },
] as const) {
  it(`${fixture.name} resolves its runtime from the bundle dependency graph`, async () => {
    const entry = new URL(fixture.entry, import.meta.url).href
    let wrapper: {
      apply(ctx: unknown, config: unknown): Promise<void>
      inject: readonly string[]
      name: string
    }
    try {
      wrapper = await import(entry)
    } catch (cause) {
      assert.fail(`wrapper entry ${fixture.entry} must load: ${String(cause)}`)
    }

    const imported: string[] = []
    const mounted: Array<{ plugin: unknown, config: unknown }> = []
    const plugin = { name: fixture.dependency, apply() {} }
    const config = { marker: fixture.name }
    await wrapper.apply({
      loader: {
        import: async (specifier: string) => {
          imported.push(specifier)
          return plugin
        },
        unwrapExports: (exports: unknown) => exports,
      },
      plugin: async (mountedPlugin: unknown, mountedConfig: unknown) => {
        mounted.push({ plugin: mountedPlugin, config: mountedConfig })
      },
    }, config)

    assert.equal(wrapper.name, fixture.name)
    assert.deepEqual(wrapper.inject, ['loader'])
    assert.deepEqual(imported, [requireFromPackage.resolve(fixture.dependency)])
    assert.deepEqual(mounted, [{ plugin, config }])
  })
}
