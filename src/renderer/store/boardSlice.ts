import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface BoardState {
  currentBoardId: string | null
  boards: any[]
  columns: any[]
  tasks: any[]
  isLoading: boolean
  error: string | null
}

const initialState: BoardState = {
  currentBoardId: null,
  boards: [],
  columns: [],
  tasks: [],
  isLoading: false,
  error: null
}

const boardSlice = createSlice({
  name: 'board',
  initialState,
  reducers: {
    setCurrentBoard: (state, action: PayloadAction<string | null>) => {
      state.currentBoardId = action.payload
    },
    setBoards: (state, action: PayloadAction<any[]>) => {
      state.boards = action.payload
    },
    setColumns: (state, action: PayloadAction<any[]>) => {
      state.columns = action.payload
    },
    setTasks: (state, action: PayloadAction<any[]>) => {
      state.tasks = action.payload
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
    }
  }
})

export const { setCurrentBoard, setBoards, setColumns, setTasks, setLoading, setError } =
  boardSlice.actions

export default boardSlice.reducer
