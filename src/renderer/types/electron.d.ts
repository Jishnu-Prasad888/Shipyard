export {}

declare global {
  interface Window {
    electron: {
      db: {
        findAll: (table: string) => Promise<any>
        findById: (table: string, id: string) => Promise<any>
        create: (table: string, data: any) => Promise<any>
        update: (table: string, id: string, data: any) => Promise<any>
        delete: (table: string, id: string) => Promise<any>
        getBoardWithDetails: (id: string) => Promise<any>
        getDocksWithFolders: () => Promise<any>
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
      }

      darkMode: {
        toggle: (enabled: boolean) => Promise<any>
      }
    }
  }
}