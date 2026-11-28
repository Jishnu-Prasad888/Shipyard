// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  base64ToBlob,
  clearScreenshotTarget,
  currentScreenshotTarget,
  setScreenshotTarget,
  takeScreenshot,
  type ScreenshotTarget
} from './screenshot'
import { TOAST_EVENT } from './overlays'

const PNG_BASE64 = btoa('\x89PNG fake')

type Bridge = { screenshot: { capture: ReturnType<typeof vi.fn> } }
const setBridge = (bridge: Bridge): void => {
  ;(window as unknown as { electron: Bridge }).electron = bridge
}

const toasts: string[] = []
window.addEventListener(TOAST_EVENT, (event) => {
  toasts.push((event as CustomEvent<{ message: string }>).detail.message)
})

const mockCapture = (result: unknown): void => {
  setBridge({ screenshot: { capture: vi.fn().mockResolvedValue(result) } })
}

const makeTarget = (alive = true): ScreenshotTarget & { received: File[] } => {
  const received: File[] = []
  return {
    received,
    insertImages: async (files) => {
      received.push(...files)
    },
    isAlive: () => alive
  }
}

afterEach(() => {
  toasts.length = 0
  const current = currentScreenshotTarget()
  if (current) clearScreenshotTarget(current)
})

describe('screenshots', () => {
  it('decodes base64 into a typed blob', async () => {
    const blob = base64ToBlob(PNG_BASE64, 'image/png')
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBe('\x89PNG fake'.length)
  })

  it('inserts into the editor used last', async () => {
    const first = makeTarget()
    const second = makeTarget()
    setScreenshotTarget(first)
    setScreenshotTarget(second)
    mockCapture({ data: PNG_BASE64, ext: 'png', path: '/tmp/s.png' })
    await takeScreenshot('area')
    expect(window.electron.screenshot.capture).toHaveBeenCalledWith('area')
    expect(second.received).toHaveLength(1)
    expect(second.received[0].type).toBe('image/png')
    expect(first.received).toHaveLength(0)
    expect(toasts).toEqual(['Screenshot added to the notes'])
  })

  it('ignores an editor that has gone away and only clears the current one', () => {
    const closed = makeTarget(false)
    setScreenshotTarget(closed)
    expect(currentScreenshotTarget()).toBeNull()
    const open = makeTarget()
    setScreenshotTarget(open)
    clearScreenshotTarget(closed)
    expect(currentScreenshotTarget()).toBe(open)
  })

  it('reports where it was saved when no editor is open', async () => {
    mockCapture({ data: PNG_BASE64, ext: 'png', path: '/home/me/Pictures/s.png' })
    await takeScreenshot('full')
    expect(toasts[0]).toContain('/home/me/Pictures/s.png')
  })

  it('does nothing when cancelled', async () => {
    const target = makeTarget()
    setScreenshotTarget(target)
    mockCapture(null)
    await takeScreenshot('area')
    expect(target.received).toHaveLength(0)
    expect(toasts).toEqual([])
  })

  it('shows capture errors', async () => {
    setBridge({
      screenshot: { capture: vi.fn().mockRejectedValue(new Error('portal unavailable')) }
    })
    await takeScreenshot('area')
    expect(toasts).toEqual(['portal unavailable'])
  })
})
