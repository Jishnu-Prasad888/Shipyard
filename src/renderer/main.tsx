import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { store } from './store'
import App from './App'
import './index.css'

declare global {
  interface Window {
    electron: {
      db: {
        findAll: (table: string) => Promise<any[]>
        findById: (table: string, id: string) => Promise<any>
        create: (table: string, data: any) => Promise<any>
        update: (table: string, id: string, data: any) => Promise<any>
        delete: (table: string, id: string) => Promise<boolean>
        getBoardWithDetails: (id: string) => Promise<any>
        getDocksWithFolders: () => Promise<any[]>
      }
      settings: {
        get: () => Promise<any>
        save: (settings: any) => Promise<any>
      }
      sync: {
        start: () => Promise<any>
        status: () => Promise<any>
      }
      darkMode: {
        toggle: (enabled: boolean) => Promise<void>
      }
    }
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
)
