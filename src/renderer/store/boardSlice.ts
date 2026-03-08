import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface BoardState {
  currentBoardId: string | null
  boards: any[]
  lists: any[]
  cards: any[]
  isLoading: boolean
  error: string | null
}

const initialState: BoardState = {
  currentBoardId: null,
  boards: [],
  lists: [],
  cards: [],
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
    setLists: (state, action: PayloadAction<any[]>) => {
      state.lists = action.payload
    },
    setCards: (state, action: PayloadAction<any[]>) => {
      state.cards = action.payload
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
    }
  }
})

export const { setCurrentBoard, setBoards, setLists, setCards, setLoading, setError } =
  boardSlice.actions

export default boardSlice.reducer
