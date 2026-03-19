import { app, BrowserWindow, ipcMain, shell, Menu, dialog, Tray } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { DatabaseService } from './database/database.service.js'
import { SyncService } from './database/sync.service.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let tray: Tray
let isQuitting = false

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

let mainWindow: BrowserWindow | null = null
let databaseService: DatabaseService
let syncService: SyncService

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    icon: path.join(__dirname, 'logo.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/preload.js')
    },
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#E8F3FA'
  })

  Menu.setApplicationMenu(null)

  // Initialize database
  databaseService = DatabaseService.getInstance()
  await databaseService.initialize()

  // Initialize sync service
  syncService = SyncService.getInstance(databaseService)

  // Auto-restore Firebase from saved settings
  const savedSettings = databaseService.getSettings()
  if (savedSettings?.firebaseEnabled && savedSettings?.firebaseConfig) {
    try {
      const result = await syncService.initialize(savedSettings.firebaseConfig)
      console.log('[Firebase] Auto-init on startup:', result.message)
      if (result.success && savedSettings.syncEnabled) {
        syncService.enableAutoSync()
      }
    } catch (err) {
      console.error('[Firebase] Auto-init failed:', err)
    }
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'))
  }

  mainWindow.on('close', (e) => {
    const settings = databaseService.getSettings()
    if (!isQuitting && settings?.minimizeToTray) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('minimize', () => {
    const settings = databaseService.getSettings()
    if (settings?.minimizeToTray) {
      mainWindow?.hide()
    }
  })

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  createWindow()

  tray = new Tray(path.join(__dirname, 'logo.png'))

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setToolTip('Shipyard')
  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow?.hide()
    } else {
      mainWindow?.show()
    }
  })

  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
})

app.on('window-all-closed', () => {
  // no-op: keep the app alive; quitting is handled via tray or before-quit
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// ── IPC: Database ──
ipcMain.handle('db:query', async (_event, { operation, table, data, id }) => {
  try {
    switch (operation) {
      case 'findAll':
        return databaseService.findAll(table)
      case 'findById':
        return databaseService.findById(table, id)
      case 'create':
        return databaseService.create(table, data)
      case 'update':
        return databaseService.update(table, id, data)
      case 'delete':
        return databaseService.delete(table, id)
      case 'getBoardWithDetails':
        return databaseService.getBoardWithDetails(id)
      case 'getDocksWithFolders':
        return databaseService.getDocksWithFolders()
      default:
        throw new Error(`Unknown operation: ${operation}`)
    }
  } catch (error) {
    console.error('Database error:', error)
    throw error
  }
})

// ── IPC: Settings ──
ipcMain.handle('settings:get', async () => {
  return databaseService.getSettings()
})

ipcMain.handle('settings:save', async (_event, settings) => {
  databaseService.saveSettings(settings)

  if (settings.firebaseEnabled && settings.firebaseConfig) {
    const result = await syncService.initialize(settings.firebaseConfig)
    if (result.success && settings.syncEnabled) {
      syncService.enableAutoSync()
    } else if (!settings.syncEnabled) {
      syncService.stopSync()
      await syncService.initialize(settings.firebaseConfig)
    }
    return { ...settings, _initResult: result }
  } else {
    syncService.stopSync()
  }

  return settings
})

// ── IPC: Sync ──
ipcMain.handle('sync:start', async () => {
  return syncService.pushToFirebase()
})

ipcMain.handle('sync:pull', async () => {
  return syncService.pullFromFirebase()
})

ipcMain.handle('sync:test', async () => {
  return syncService.testConnection()
})

ipcMain.handle('sync:status', async () => {
  return syncService.getSyncStatus()
})

ipcMain.handle('sync:push', async () => {
  return syncService.pushToFirebase()
})

// ── IPC: Dark mode ──
ipcMain.handle('dark-mode:toggle', async (_event, enabled) => {
  if (mainWindow) {
    mainWindow.webContents.insertCSS(
      enabled ? `html { background: #0f0c1b; }` : `html { background: #f4f8fb; }`
    )
  }
})

// ── IPC: Export — single file ──
ipcMain.handle('export:saveFile', async (_event, { defaultName, content, ext }) => {
  const filters: Record<string, { name: string; extensions: string[] }[]> = {
    json: [{ name: 'JSON', extensions: ['json'] }],
    csv: [{ name: 'CSV', extensions: ['csv'] }],
    md: [{ name: 'Markdown', extensions: ['md'] }]
  }
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'Export Shipyard Data',
    defaultPath: `${defaultName}.${ext}`,
    filters: filters[ext] || [{ name: 'All Files', extensions: ['*'] }]
  })
  if (result.canceled || !result.filePath) return { success: false }
  try {
    fs.writeFileSync(result.filePath, content, 'utf-8')
    return { success: true, filePath: result.filePath }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

// ── IPC: Export — multiple files (per-dock) ──
ipcMain.handle(
  'export:saveFolder',
  async (_event, files: { name: string; content: string; ext: string }[]) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose Folder to Save Export Files',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return { success: false }
    const folder = result.filePaths[0]
    const saved: string[] = []
    try {
      for (const file of files) {
        const filePath = path.join(folder, `${file.name}.${file.ext}`)
        fs.writeFileSync(filePath, file.content, 'utf-8')
        saved.push(filePath)
      }
      return { success: true, folder, count: saved.length }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }
)

// ── IPC: Utility — open file/folder ──
ipcMain.handle('export:openItem', async (_event, targetPath: string) => {
  try {
    shell.showItemInFolder(targetPath)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})
