/**
 * Screenshots (Alt+Shift+S, or right-click › Screenshot). The desktop's
 * screenshot tool does the capture while Shipyard's window is hidden; the
 * image then goes into the notes editor that was used last, if one is still
 * open, otherwise to the clipboard (the file stays where the desktop saved it).
 */
import { showToast } from './overlays'

export type ScreenshotMode = 'area' | 'full'

/** A notes editor that can receive images. */
export interface ScreenshotTarget {
  /** Resolves to the number of images actually inserted. */
  insertImages: (files: File[]) => Promise<number>
  /** False once the editor is gone (closed task, destroyed view). */
  isAlive: () => boolean
  /** False while the notes are shown in preview. */
  isEditable: () => boolean
}

let target: ScreenshotTarget | null = null

/** Called by an editor when it gets focus. */
export const setScreenshotTarget = (next: ScreenshotTarget): void => {
  target = next
}

/** Called by an editor when it goes away; only clears it if it is current. */
export const clearScreenshotTarget = (which: ScreenshotTarget): void => {
  if (target === which) target = null
}

export const currentScreenshotTarget = (): ScreenshotTarget | null =>
  target && target.isAlive() ? target : null

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  bmp: 'image/bmp'
}

export const base64ToBlob = (base64: string, type: string): Blob => {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type })
}

const copyToClipboard = async (blob: Blob): Promise<boolean> => {
  try {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
    return true
  } catch {
    return false
  }
}

let busy = false

/** Takes a screenshot and delivers it. Resolves once it is placed (or cancelled). */
export const takeScreenshot = async (mode: ScreenshotMode): Promise<void> => {
  if (busy) return
  busy = true
  // Remember the editor now: focus moves while the window is hidden.
  const destination = currentScreenshotTarget()
  try {
    const shot = await window.electron.screenshot.capture(mode)
    if (!shot) return // cancelled
    const type = MIME[shot.ext] || 'image/png'
    const blob = base64ToBlob(shot.data, type)
    if (destination && destination.isAlive() && destination.isEditable()) {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')
      const file = new File([blob], `Screenshot ${stamp}.${shot.ext}`, { type })
      // A failed upload (e.g. an image over 20 MB) is reported by the
      // editor itself; don't cover that message with a success toast.
      if ((await destination.insertImages([file])) > 0) {
        showToast({ message: 'Screenshot added to the notes' })
      }
      return
    }
    const copied = await copyToClipboard(blob)
    const where = shot.path ? ` Saved to ${shot.path}` : ''
    const hint =
      destination && destination.isAlive()
        ? 'Switch the notes to Edit to insert screenshots.'
        : "Open a task's notes to insert screenshots."
    showToast({
      message: copied ? `Screenshot copied to the clipboard.${where}` : `${hint}${where}`
    })
  } catch (error) {
    showToast({ message: error instanceof Error ? error.message : String(error) })
  } finally {
    busy = false
  }
}
