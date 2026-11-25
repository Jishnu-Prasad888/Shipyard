/**
 * Images in notes are stored as files in the data folder's `assets/`
 * directory and referenced from note HTML as `shipyard-asset:<name>`.
 * The reference resolves through the open folder, so it works for local
 * folders and for folders shared from another computer alike.
 */

export const ASSET_PREFIX = 'shipyard-asset:'
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp'
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp'
}

export const isAssetRef = (src: string | null | undefined): boolean =>
  typeof src === 'string' && src.startsWith(ASSET_PREFIX)

export const assetNameFromRef = (src: string): string => src.slice(ASSET_PREFIX.length)

/** File extension for an image file, or null when the type is not supported. */
export const imageExtension = (file: { type: string; name?: string }): string | null => {
  if (EXTENSIONS[file.type]) return EXTENSIONS[file.type]
  const fromName = file.name?.split('.').pop()?.toLowerCase()
  return fromName && MIME_BY_EXT[fromName] ? fromName : null
}

export const isSupportedImage = (file: { type: string; name?: string }): boolean =>
  imageExtension(file) !== null

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

/** Saves an image into the open folder and returns the reference for notes. */
export const uploadImage = async (file: File): Promise<string> => {
  const ext = imageExtension(file)
  if (!ext) throw new Error(`${file.name || 'This file'} is not a supported image type`)
  if (file.size > MAX_IMAGE_BYTES) throw new Error(`${file.name || 'Image'} is larger than 20 MB`)
  const data = await blobToBase64(file)
  const name: string = await window.electron.assets.save(data, ext)
  return ASSET_PREFIX + name
}

// Resolved images are cached as object URLs for the lifetime of the window.
const urlCache = new Map<string, Promise<string | null>>()

const base64ToObjectUrl = (base64: string, mime: string): string => {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type: mime }))
}

/** A URL the browser can display for an asset reference (null if missing). */
export const resolveAssetUrl = (src: string): Promise<string | null> => {
  const name = assetNameFromRef(src)
  let pending = urlCache.get(name)
  if (!pending) {
    const ext = name.split('.').pop()?.toLowerCase() || ''
    pending = window.electron.assets
      .read(name)
      .then((data: string | null) =>
        data ? base64ToObjectUrl(data, MIME_BY_EXT[ext] || 'application/octet-stream') : null
      )
      .catch(() => null)
    urlCache.set(name, pending)
    // Let a later attempt retry if this one failed (e.g. share offline).
    pending.then((url) => {
      if (!url) urlCache.delete(name)
    })
  }
  return pending
}

/** Forgets cached images, e.g. after switching to a different folder. */
export const clearAssetCache = (): void => {
  for (const pending of urlCache.values()) {
    pending.then((url) => url && URL.revokeObjectURL(url))
  }
  urlCache.clear()
}
