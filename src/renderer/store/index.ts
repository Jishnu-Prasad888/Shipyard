import { configureStore } from '@reduxjs/toolkit'
import docksReducer from './docksSlice'
import boardReducer from './boardSlice'
import settingsReducer from './settingsSlice'

export const store = configureStore({
  reducer: {
    docks: docksReducer,
    board: boardReducer,
    settings: settingsReducer
  }
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
