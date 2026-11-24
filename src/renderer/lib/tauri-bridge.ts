/**
 * src/renderer/lib/tauri-bridge.ts
 *
 * Exposes the app API as `window.electron` (name kept for existing call
 * sites). Data calls go to the open folder, which is either on this computer
 * or shared from another machine over the network.
 *
 * Import once in src/renderer/main.tsx before any component renders.
 */

import { invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import type { ShareStatus, SourceDescriptor, SourceStatus } from '../types/source'

// ── Type helpers ──
interface DbArgs {
  operation: string
  table?: string
  data?: any
  id?: string
}

async function dbQuery(args: DbArgs): Promise<any> {
  return invoke<any>('db_query', { args })
}

const electronBridge = {
  source: {
    status: () => invoke<SourceStatus>('source_status'),
    pickFolder: async (): Promise<string | null> => {
      const selected = await openDialog({ directory: true, multiple: false })
      return typeof selected === 'string' ? selected : null
    },
    openLocal: (path: string) => invoke<SourceDescriptor>('source_open_local', { path }),
    openRemote: (address: string, token: string) =>
      invoke<SourceDescriptor>('source_open_remote', { address, token }),
    close: () => invoke<void>('source_close'),
    forget: (descriptor: SourceDescriptor) => invoke<void>('source_forget', { descriptor })
  },

  share: {
    status: () => invoke<ShareStatus>('share_status'),
    start: (args: { port?: number; token?: string; host?: string; readOnly?: boolean }) =>
      invoke<ShareStatus>('share_start', { args }),
    stop: () => invoke<ShareStatus>('share_stop')
  },

  db: {
    findAll: (table: string) => dbQuery({ operation: 'findAll', table }),
    findById: (table: string, id: string) => dbQuery({ operation: 'findById', table, id }),
    create: (table: string, data: any) => dbQuery({ operation: 'create', table, data }),
    update: (table: string, id: string, data: any) =>
      dbQuery({ operation: 'update', table, id, data }),
    delete: (table: string, id: string) => dbQuery({ operation: 'delete', table, id }),
    getBoardWithDetails: (id: string) => dbQuery({ operation: 'getBoardWithDetails', id }),
    getProjectsWithWorkspaces: () => dbQuery({ operation: 'getProjectsWithWorkspaces' })
  },

  settings: {
    get: () => invoke<any>('settings_get'),
    save: (settings: any) => invoke<any>('settings_save', { settings })
  },

  sync: {
    start: () => invoke<any>('sync_push'),
    status: () => invoke<any>('sync_status'),
    test: () => invoke<any>('sync_test'),
    push: () => invoke<any>('sync_push'),
    pull: () => invoke<any>('sync_pull'),
    markSynced: (ids: string[]) => invoke<any>('sync_mark_synced', { ids })
  },

  darkMode: {
    // In Tauri, dark mode is managed entirely by CSS classes on <html>.
    // We keep this stub so existing callers don't break.
    toggle: (_enabled: boolean) => invoke<any>('dark_mode_toggle', { enabled: _enabled })
  },

  export: {
    saveFile: async (opts: { defaultName: string; content: string; ext: string }) => {
      return invoke<any>('export_save_file', { args: opts })
    },
    saveFolder: async (files: { name: string; content: string; ext: string }[]) => {
      return invoke<any>('export_save_folder', { files })
    },
    openItem: async (targetPath: string) => {
      return invoke<any>('export_open_item', { targetPath })
    }
  }
}

;(window as any).electron = electronBridge

export default electronBridge
