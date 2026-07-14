import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { Settings } from '@shared/types'

const initialState: Settings = {
  theme: 'light', // legacy fallback
  colorMode: 'light',
  themeStyle: 'brutalist',
  firebaseEnabled: false,
  syncEnabled: false,
  minimizeToTray: true,
  serverUrl: '',
  serverSyncEnabled: false
}

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setSettings: (state, action: PayloadAction<Settings>) => {
      return { ...state, ...action.payload }
    },
    setTheme: (state, action: PayloadAction<'light' | 'dark'>) => {
      state.theme = action.payload
      state.colorMode = action.payload
    },
    setColorMode: (state, action: PayloadAction<'light' | 'dark'>) => {
      state.colorMode = action.payload
      state.theme = action.payload
    },
    setThemeStyle: (state, action: PayloadAction<'brutalist' | 'clay'>) => {
      state.themeStyle = action.payload
    },
    setFirebaseEnabled: (state, action: PayloadAction<boolean>) => {
      state.firebaseEnabled = action.payload
    },
    setSyncEnabled: (state, action: PayloadAction<boolean>) => {
      state.syncEnabled = action.payload
    },
    setFirebaseConfig: (state, action: PayloadAction<any>) => {
      state.firebaseConfig = action.payload
    }
  }
})

export const {
  setSettings,
  setTheme,
  setColorMode,
  setThemeStyle,
  setFirebaseEnabled,
  setSyncEnabled,
  setFirebaseConfig
} = settingsSlice.actions

export default settingsSlice.reducer
