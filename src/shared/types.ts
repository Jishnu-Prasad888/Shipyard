export interface Project {
  id: string
  name: string
  description?: string
  workspaceId?: string
  tags: string[]
  createdAt: number
  updatedAt: number
  color?: string
  boardIds: string[]
}

export interface Workspace {
  id: string
  name: string
  color?: string
  parentWorkspaceId?: string
  createdAt: number
}

export interface Board {
  id: string
  name: string
  description?: string
  projectId: string
  columns: Column[]
  connections: Connection[]
  color?: string
  tags: string[]
  createdAt: number
  updatedAt: number
}

export interface Column {
  id: string
  name: string
  boardId: string
  tasks: Task[]
  order: number
  color?: string
  createdAt: number
  updatedAt: number
}

export interface Task {
  id: string
  title: string
  description?: string
  columnId: string
  boardId?: string
  order: number
  color?: string
  tags: Tag[]
  deadline?: number
  status: Status
  notes?: string
  subtasks: Subtask[]
  connectedTaskIds: string[]
  connectedColumnIds: string[]
  createdAt: number
  updatedAt: number
}

export interface Subtask {
  id: string
  title: string
  completed: boolean
  taskId: string
  createdAt: number
}

export interface Tag {
  id: string
  name: string
  color: string
}

export interface Status {
  id: string
  name: string
  color: string
  boardId: string
}

export interface Connection {
  id: string
  fromId: string
  toId: string
  type: 'task-to-task' | 'column-to-column'
  points?: { x: number; y: number }[]
}

export interface FirebaseConfig {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
}

export interface Settings {
  theme: 'light' | 'dark'
  firebaseEnabled: boolean
  firebaseConfig?: FirebaseConfig
  syncEnabled: boolean
  fontFamily?: string
  minimizeToTray: boolean
  serverUrl?: string
  serverSyncEnabled?: boolean
  lastServerSyncAt?: number
}
