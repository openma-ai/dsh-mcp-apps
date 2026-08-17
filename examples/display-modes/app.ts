import { App, type McpUiDisplayMode } from '@modelcontextprotocol/ext-apps'

const root = requireElement<HTMLElement>('app')
const countNode = requireElement<HTMLElement>('count')
const modeNode = requireElement<HTMLElement>('current-mode')
const lifecycleNode = requireElement<HTMLElement>('lifecycle')
const increment = requireElement<HTMLButtonElement>('increment')
let count = 0

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (element === null) throw new Error(`display modes fixture is missing #${id}`)
  return element as T
}

function renderCount(): void {
  countNode.textContent = String(count)
  root.dataset.count = String(count)
}

function renderMode(mode: McpUiDisplayMode): void {
  modeNode.textContent = mode === 'pip' ? 'picture-in-picture' : mode
  root.dataset.mode = mode
}

const app = new App(
  { name: 'dsh-display-modes-fixture', version: '1.0.0' },
  { availableDisplayModes: ['inline', 'fullscreen', 'pip'] },
  { autoResize: false, strict: true },
)

app.ontoolresult = (result) => {
  const value = result.structuredContent?.counter
  if (typeof value === 'number' && Number.isFinite(value)) count = value
  renderCount()
}
app.onhostcontextchanged = ({ displayMode }) => {
  if (displayMode !== undefined) renderMode(displayMode)
}
app.onteardown = async () => {
  lifecycleNode.textContent = 'closed cleanly'
  root.dataset.lifecycle = 'closed'
  return {}
}

increment.addEventListener('click', () => {
  count += 1
  renderCount()
})
for (const mode of ['inline', 'fullscreen', 'pip'] as const) {
  requireElement<HTMLButtonElement>(`mode-${mode}`).addEventListener('click', async () => {
    const result = await app.requestDisplayMode({ mode })
    renderMode(result.mode)
  })
}

renderCount()
void app.connect().then(() => {
  renderMode(app.getHostContext()?.displayMode ?? 'inline')
  lifecycleNode.textContent = 'connected'
  root.dataset.lifecycle = 'connected'
}).catch((error: unknown) => {
  lifecycleNode.textContent = `failed: ${String(error)}`
  root.dataset.lifecycle = 'failed'
})
