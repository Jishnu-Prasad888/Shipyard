// Must be the first import: installs window.electron before any component loads
import './lib/tauri-bridge'

import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { store } from './store'
import App from './App'
import { FolderGate } from './components/Folder/FolderGate'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <FolderGate>
        <App />
      </FolderGate>
    </Provider>
  </React.StrictMode>
)
