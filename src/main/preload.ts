import { contextBridge, clipboard } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // clipboard operations
  copyToClipboard: (text: string) => clipboard.writeText(text)
})

// Type declarations
declare global {
  interface Window {
    api: {}
  }
}
