import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent
} from 'react'

type Size = { width: number; height: number }

type ResizableDialogOptions = {
  storageKey: string
  defaultWidth: number
  defaultHeight: number
  minWidth?: number
  minHeight?: number
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const clampToViewport = (width: number, height: number, opts: Required<ResizableDialogOptions>) => {
  if (typeof window === 'undefined') return { width, height }

  const maxWidth = Math.max(opts.minWidth, window.innerWidth - 32)
  const maxHeight = Math.max(opts.minHeight, window.innerHeight - 32)

  return {
    width: clamp(width, opts.minWidth, maxWidth),
    height: clamp(height, opts.minHeight, maxHeight)
  }
}

export const useResizableDialog = (options: ResizableDialogOptions) => {
  const optsRef = useRef<Required<ResizableDialogOptions>>({
    ...options,
    minWidth: options.minWidth ?? 480,
    minHeight: options.minHeight ?? 360
  })

  const [size, setSize] = useState<Size>(() => {
    const opts = optsRef.current

    if (typeof window === 'undefined') {
      return { width: opts.defaultWidth, height: opts.defaultHeight }
    }

    try {
      const raw = localStorage.getItem(opts.storageKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (typeof parsed?.width === 'number' && typeof parsed?.height === 'number') {
          return clampToViewport(parsed.width, parsed.height, opts)
        }
      }
    } catch {
      /* ignore */
    }

    return clampToViewport(opts.defaultWidth, opts.defaultHeight, opts)
  })

  const [isResizing, setIsResizing] = useState(false)
  const ignoreClickRef = useRef(false)

  const startRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null)

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!startRef.current) return

    const opts = optsRef.current
    const next = clampToViewport(
      startRef.current.width + (event.clientX - startRef.current.x),
      startRef.current.height + (event.clientY - startRef.current.y),
      opts
    )

    setSize(next)
  }, [])

  const stopResizing = useCallback(() => {
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', stopResizing)
    startRef.current = null
    setIsResizing(false)
    setTimeout(() => {
      ignoreClickRef.current = false
    }, 200)
  }, [handleMouseMove])

  useEffect(() => {
    return () => stopResizing()
  }, [stopResizing])

  const handleResizeStart = useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault()
      event.stopPropagation()

      startRef.current = { x: event.clientX, y: event.clientY, width: size.width, height: size.height }
      ignoreClickRef.current = true
      setIsResizing(true)
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', stopResizing)
    },
    [handleMouseMove, size.height, size.width, stopResizing]
  )

  const resetSize = useCallback(() => {
    const opts = optsRef.current
    setSize(clampToViewport(opts.defaultWidth, opts.defaultHeight, opts))
    if (typeof window !== 'undefined') {
      localStorage.removeItem(opts.storageKey)
    }
    ignoreClickRef.current = false
  }, [])

  useEffect(() => {
    const opts = optsRef.current
    if (typeof window === 'undefined') return
    localStorage.setItem(opts.storageKey, JSON.stringify(size))
  }, [size])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleWindowResize = () => {
      const opts = optsRef.current
      setSize((prev) => clampToViewport(prev.width, prev.height, opts))
    }
    window.addEventListener('resize', handleWindowResize)
    return () => window.removeEventListener('resize', handleWindowResize)
  }, [])

  const modalStyle = useMemo<CSSProperties>(
    () => ({
      width: size.width,
      height: size.height,
      minWidth: optsRef.current.minWidth,
      minHeight: optsRef.current.minHeight,
      maxWidth: 'calc(100vw - 32px)',
      maxHeight: 'calc(100vh - 32px)'
    }),
    [size.height, size.width]
  )

  return {
    size,
    modalStyle,
    handleResizeStart,
    resetSize,
    isResizing,
    shouldIgnoreOverlayClick: () => {
      if (isResizing || ignoreClickRef.current) {
        ignoreClickRef.current = false
        return true
      }
      return false
    }
  }
}
