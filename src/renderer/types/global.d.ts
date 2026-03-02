export {}

declare global {
  interface Window {
    api: {
      createImage: (
        filePath: string,
        folderId?: string
      ) => Promise<{
        success: boolean
        id?: string
        message?: string
      }>
      openFileDialog: () => Promise<any>
      editImage: (imageId: string, edit: any) => Promise<any>
      deleteFolder: (id: string) => Promise<any>
      updateFolder: (id: string, updates: { name?: string }) => Promise<any>
      setWallpaper: (imageId: string) => Promise<any>
      getSettings: () => Promise<{
        success: boolean
        data?: Record<string, string>
      }>
      emptyTrash: () => Promise<{ success: boolean; message?: string }>

      getImages: (folderId?: string, search?: string) => Promise<any>
      getFolders: () => Promise<any>
      getTags: () => Promise<any>
      getTrash: () => Promise<any>
      createFolder: (name: string, parentId?: string) => Promise<any>
      deleteImage: (id: string) => Promise<any>
      restoreImage: (id: string) => Promise<any>
      restoreFolder: (id: string) => Promise<any>
      permanentlyDelete: (type: 'image' | 'folder', id: string) => Promise<any>
      updateSettings: (updates: Record<string, any>) => Promise<any>
    }
  }
}
