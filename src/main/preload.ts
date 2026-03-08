import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  db: {
    findAll: (table: string) => ipcRenderer.invoke('db:query', { operation: 'findAll', table }),
    findById: (table: string, id: string) =>
      ipcRenderer.invoke('db:query', { operation: 'findById', table, id }),
    create: (table: string, data: any) =>
      ipcRenderer.invoke('db:query', { operation: 'create', table, data }),
    update: (table: string, id: string, data: any) =>
      ipcRenderer.invoke('db:query', { operation: 'update', table, id, data }),
    delete: (table: string, id: string) =>
      ipcRenderer.invoke('db:query', { operation: 'delete', table, id }),
    getBoardWithDetails: (id: string) =>
      ipcRenderer.invoke('db:query', { operation: 'getBoardWithDetails', id }),
    getDocksWithFolders: () => ipcRenderer.invoke('db:query', { operation: 'getDocksWithFolders' })
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (settings: any) => ipcRenderer.invoke('settings:save', settings)
  },
  sync: {
    start: () => ipcRenderer.invoke('sync:start'),
    status: () => ipcRenderer.invoke('sync:status')
  },
  darkMode: {
    toggle: (enabled: boolean) => ipcRenderer.invoke('dark-mode:toggle', enabled)
  }
})
