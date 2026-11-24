/**
 * src/renderer/types/electron.d.ts
 *
 * window.electron is populated by tauri-bridge.ts at runtime.
 */
import type { ShareStatus, SourceDescriptor, SourceStatus } from './source'

declare global {
  interface Window {
    electron: {
      source: {
        status: () => Promise<SourceStatus>
        pickFolder: () => Promise<string | null>
        openLocal: (path: string) => Promise<SourceDescriptor>
        openRemote: (address: string, token: string) => Promise<SourceDescriptor>
        close: () => Promise<void>
        forget: (descriptor: SourceDescriptor) => Promise<void>
      }
      share: {
        status: () => Promise<ShareStatus>
        start: (args: {
          port?: number
          token?: string
          host?: string
          readOnly?: boolean
        }) => Promise<ShareStatus>
        stop: () => Promise<ShareStatus>
      }
      db: {
        findAll: (table: string) => Promise<any>
        findById: (table: string, id: string) => Promise<any>
        create: (table: string, data: any) => Promise<any>
        update: (table: string, id: string, data: any) => Promise<any>
        delete: (table: string, id: string) => Promise<any>
        getBoardWithDetails: (id: string) => Promise<any>
        getProjectsWithWorkspaces: () => Promise<any>
      }
      settings: {
        get: () => Promise<any>
        save: (settings: any) => Promise<any>
      }
      sync: {
        start: () => Promise<any>
        status: () => Promise<any>
        test: () => Promise<any>
        push: () => Promise<any>
        pull: () => Promise<any>
        markSynced: (ids: string[]) => Promise<any>
      }
      darkMode: {
        toggle: (enabled: boolean) => Promise<any>
      }
      export: {
        saveFile: (opts: { defaultName: string; content: string; ext: string }) => Promise<any>
        saveFolder: (files: { name: string; content: string; ext: string }[]) => Promise<any>
        openItem: (targetPath: string) => Promise<any>
      }
    }
  }
}
