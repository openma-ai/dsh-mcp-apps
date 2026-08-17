import type { ToolCallOwnerProps } from '@deepseek-ai/dsh-client-ui-tool/client'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * Shape-driven Tool renderer chain introduced by the DSH MCP Apps host.
     * Keep this compatibility declaration until the published UI Tool package
     * includes the slot already present on DSH main.
     */
    'tool.call.takeover': {
      kind: 'chain'
      scope: 'session'
      owner: ToolCallOwnerProps
    }
  }
}
