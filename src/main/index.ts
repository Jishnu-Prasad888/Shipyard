import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import path from 'path'
import { is } from '@electron-toolkit/utils'
import { protocol } from 'electron'

let mainWindow: BrowserWindow | null = null

type TrashItem = {
  id: string
  name: string
  deleted_at: string
  type: 'image' | 'folder'
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/preload.js')
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 20 }
  })

  // if (process.env.NODE_ENV === 'development') {
  //   mainWindow.loadURL('http://localhost:5173')
  //   mainWindow.webContents.openDevTools()
  // } else {
  //   mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  // }

  if (is.dev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
    Menu.setApplicationMenu(null)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  protocol.registerFileProtocol('folio', (request, callback) => {
    const filePath = request.url.replace('folio://', '')
    callback(decodeURI(filePath))
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
