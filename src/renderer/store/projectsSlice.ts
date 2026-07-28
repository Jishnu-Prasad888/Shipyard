import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface ProjectsState {
  projects: any[]
  workspaces: any[]
  selectedProjectId: string | null
  isLoading: boolean
}

const initialState: ProjectsState = {
  projects: [],
  workspaces: [],
  selectedProjectId: null,
  isLoading: false
}

const projectsSlice = createSlice({
  name: 'projects',
  initialState,
  reducers: {
    setProjects: (state, action: PayloadAction<any[]>) => {
      state.projects = action.payload
    },
    setWorkspaces: (state, action: PayloadAction<any[]>) => {
      state.workspaces = action.payload
    },
    setSelectedProject: (state, action: PayloadAction<string | null>) => {
      state.selectedProjectId = action.payload
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload
    }
  }
})

export const { setProjects, setWorkspaces, setSelectedProject, setLoading } = projectsSlice.actions

export default projectsSlice.reducer
