import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface DocksState {
  docks: any[]
  folders: any[]
  selectedDockId: string | null
  isLoading: boolean
}

const initialState: DocksState = {
  docks: [],
  folders: [],
  selectedDockId: null,
  isLoading: false
}

const docksSlice = createSlice({
  name: 'docks',
  initialState,
  reducers: {
    setDocks: (state, action: PayloadAction<any[]>) => {
      state.docks = action.payload
    },
    setFolders: (state, action: PayloadAction<any[]>) => {
      state.folders = action.payload
    },
    setSelectedDock: (state, action: PayloadAction<string | null>) => {
      state.selectedDockId = action.payload
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload
    }
  }
})

export const { setDocks, setFolders, setSelectedDock, setLoading } = docksSlice.actions

export default docksSlice.reducer
