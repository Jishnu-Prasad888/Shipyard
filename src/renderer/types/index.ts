export type Folder = {
  id: string
  name: string
  parent_id?: string
  created_at: string
  deleted_at?: string
  children?: Folder[]
}

export type Image = {
  id: string
  file_path: string
  thumbnail_path: string
  folder_id?: string
  created_at: string
  updated_at: string
  deleted_at?: string
  rotation: number
  crop_data?: string
  tags?: string
}

export type Tag = {
  id: string
  name: string
  created_at: string
}

export type Note = {
  id: string
  image_id: string
  markdown: string
  updated_at: string
}

export type Link = {
  id: string
  source_note_id: string
  target_type: 'image' | 'folder'
  target_id: string
}

export type TrashItem = {
  id: string
  type: 'image' | 'folder'
  name: string
  deleted_at: string
  original_data: any
}

export type AppState = {
  user: {
    id: string
    name: string
  } | null
  images: Image[]
  folders: Folder[]
  tags: Tag[]
  trash: TrashItem[]
  selectedImage: Image | null
  currentFolder: string | null
  theme: 'light' | 'dark'
  isLoading: boolean
  error: string | null
}

export type AppActions = {
  loadImages: (folderId?: string, search?: string) => Promise<void>
  loadFolders: () => Promise<void>
  loadTags: () => Promise<void>
  loadTrash: () => Promise<void>
  addFolder: (name: string, parentId?: string) => Promise<void>
  deleteImage: (id: string) => Promise<void>
  restoreItem: (type: 'image' | 'folder', id: string) => Promise<void>
  permanentlyDelete: (type: 'image' | 'folder', id: string) => Promise<void>
  toggleTheme: () => void
  setSelectedImage: (image: Image | null) => void
  setCurrentFolder: (folderId: string | null) => void
  setError: (error: string | null) => void
  addImages: (filePaths: string[], folderId?: string) => Promise<void>
}
