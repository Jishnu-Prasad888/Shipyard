export interface Dock {
  id: string
  name: string
  description?: string
  folderId?: string
  tags: string[]
  createdAt: number
  updatedAt: number
  color?: string
  boardIds: string[]
}

export interface DockFolder {
  id: string
  name: string
  color?: string
  createdAt: number
}

export interface Board {
  id: string
  name: string
  dockId: string
  lists: List[]
  connections: Connection[]
  createdAt: number
  updatedAt: number
}

export interface List {
  id: string
  name: string
  boardId: string
  cards: Card[]
  order: number
  color?: string
  createdAt: number
  updatedAt: number
}

export interface Card {
  id: string
  title: string
  description?: string
  listId: string
  order: number
  color?: string
  tags: Tag[]
  deadline?: number
  status: Status
  notes?: string
  subCards: SubCard[]
  connectedCardIds: string[]
  connectedListIds: string[]
  createdAt: number
  updatedAt: number
}

export interface SubCard {
  id: string
  title: string
  completed: boolean
  cardId: string
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
  type: 'card-to-card' | 'list-to-list'
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
}
