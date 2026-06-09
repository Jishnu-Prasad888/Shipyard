/**
 * src/renderer/main.tsx
 *
 * Only change from the original:
 *   1. Import './lib/tauri-bridge' at the top  ← this is the only diff
 *   2. Remove the old ReactDOM.createRoot pattern if you used StrictMode
 *
 * Everything else (App, store, index.css) is identical.
 */

// ★ Must be first import — installs window.electron before any component loads
import './lib/tauri-bridge'

import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { store } from './store'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
)
