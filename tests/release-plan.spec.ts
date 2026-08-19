import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createReleasePlan } from '../scripts/release-plan.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('one-install bundle boundary', () => {
  it('publishes runtime packages before the public root bundle', async () => {
    await expect(createReleasePlan(root, 'v0.0.2')).resolves.toEqual([
      {
        directory: 'packages/host',
        name: '@openma/dsh-mcp-apps-host',
        version: '0.0.2',
      },
      {
        directory: 'packages/web',
        name: '@openma/dsh-mcp-apps-web',
        version: '0.0.2',
      },
      {
        directory: '.',
        name: '@openma/dsh-mcp-apps',
        version: '0.0.2',
      },
    ])
  })

  it('keeps Host and Web publishable only as non-bundle runtime dependencies', async () => {
    const rootManifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')) as {
      bundledDependencies?: string[]
    }
    expect(rootManifest.bundledDependencies).toBeUndefined()

    for (const directory of ['packages/host', 'packages/web']) {
      const child = JSON.parse(await readFile(resolve(root, directory, 'package.json'), 'utf8')) as {
        dsh?: { bundle?: unknown }
        private?: boolean
        publishConfig?: { access?: string }
      }
      expect(child.private).not.toBe(true)
      expect(child.publishConfig?.access).toBe('public')
      expect(child.dsh?.bundle).toBeUndefined()
    }
  })

  it('uses npm Trusted Publisher without a long-lived token', async () => {
    const workflow = await readFile(resolve(root, '.github/workflows/release.yml'), 'utf8')
    expect(workflow).toMatch(/id-token:\s*write/u)
    expect(workflow).toMatch(/actions\/setup-node@v6/u)
    expect(workflow).toMatch(/package-manager-cache:\s*false/u)
    expect(workflow).not.toMatch(/playwright install/u)
    expect(workflow).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN/u)

    const browserTest = await readFile(resolve(root, 'apps/web/tests/mcp-app-sandbox.e2e.spec.ts'), 'utf8')
    expect(browserTest).toContain('/usr/bin/google-chrome')
  })
})
