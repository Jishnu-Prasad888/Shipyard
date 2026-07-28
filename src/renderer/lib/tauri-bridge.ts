/**
 * src/renderer/lib/tauri-bridge.ts
 *
 * Drop-in replacement for the old `window.electron` API.
 * All 144 call-sites across the renderer continue to work
 * unchanged — they call `window.electron.db.*` etc. as before.
 * This module intercepts those calls and routes them to
 * Tauri's `invoke()` instead of Electron's `ipcRenderer.invoke()`.
 *
 * USAGE: import this file once in src/renderer/main.tsx BEFORE
 * any component is rendered:
 *
 *   import './lib/tauri-bridge'
 */

import { invoke } from '@tauri-apps/api/core'

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

// ── The bridge object — identical shape to the old preload.ts ──
const electronBridge = {
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

// Attach to window so all existing call-sites work without any changes
;(window as any).electron = electronBridge

export default electronBridge
