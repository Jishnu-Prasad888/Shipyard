import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { Settings } from '@shared/types'

const initialState: Settings = {
  theme: 'light',
  firebaseEnabled: false,
  syncEnabled: false
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

export const { setSettings, setTheme, setFirebaseEnabled, setSyncEnabled, setFirebaseConfig } =
  settingsSlice.actions

export default settingsSlice.reducer
