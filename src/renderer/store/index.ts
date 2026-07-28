import { configureStore } from '@reduxjs/toolkit'
import projectsReducer from './projectsSlice'
import boardReducer from './boardSlice'
import settingsReducer from './settingsSlice'

export const store = configureStore({
  reducer: {
    projects: projectsReducer,
    board: boardReducer,
    settings: settingsReducer
  }
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
