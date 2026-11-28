import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { createNoteExtensions } from './noteExtensions'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Code,
  Quote,
  Link2,
  Highlighter,
  Type,
  Eye,
  Edit3,
  Minus,
  RotateCcw,
  RotateCw,
  ImagePlus,
  Camera,
  Monitor,
  Crop
} from 'lucide-react'
import type { EditorView } from '@tiptap/pm/view'
import { Fragment, Slice } from '@tiptap/pm/model'
import { isSupportedImage, uploadImage } from '../../lib/assets'
import {
  clearScreenshotTarget,
  setScreenshotTarget,
  takeScreenshot,
  type ScreenshotTarget
} from '../../lib/screenshot'

const notify = (message: string): void => {
  window.dispatchEvent(new CustomEvent('show-toast', { detail: { message } }))
}

/**
 * Saves image files into the data folder, then inserts them together, in
 * order, at `pos` (or at the selection). Unsupported or oversized files are
 * reported, not inserted.
 */
const insertImageFiles = async (view: EditorView, files: File[], pos?: number): Promise<number> => {
  const startDoc = view.state.doc
  const sources: { src: string; alt: string | null }[] = []
  for (const file of files) {
    try {
      sources.push({ src: await uploadImage(file), alt: file.name || null })
    } catch (error) {
      notify(error instanceof Error ? error.message : `Could not add image: ${String(error)}`)
    }
  }
  const imageType = view.state.schema.nodes.image
  if (view.isDestroyed || !imageType || sources.length === 0) return 0
  // If the notes changed during the upload the drop position is stale, so
  // use wherever the cursor is now.
  const at =
    pos !== undefined && view.state.doc.eq(startDoc)
      ? Math.min(pos, view.state.doc.content.size)
      : view.state.selection.from
  const nodes = sources.map((attrs) => imageType.create(attrs))
  // replaceRange splits the surrounding paragraph where needed and keeps order.
  view.dispatch(
    view.state.tr.replaceRange(at, at, new Slice(Fragment.from(nodes), 0, 0)).scrollIntoView()
  )
  return nodes.length
}

/**
 * True when the clipboard holds only image data. Office and some browsers
 * put a picture of copied text next to the text itself; then the text wins.
 */
const isImageOnlyPaste = (data: DataTransfer | null): boolean =>
  !!data && !data.getData('text/plain').trim() && imageFilesFrom(data.files).length > 0

const imageFilesFrom = (list: FileList | null | undefined): File[] =>
  Array.from(list || []).filter((file) => isSupportedImage(file))

// ── Toolbar Button ───────────────────────────────────────────────────
const ToolBtn = ({
  onClick,
  active,
  title,
  children,
  disabled = false
}: {
  onClick: () => void
  active?: boolean
  title: string
  children: React.ReactNode
  disabled?: boolean
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className="flex items-center justify-center w-7 h-7 border-2 transition-all duration-100 disabled:opacity-30"
    style={{
      borderColor: active ? 'var(--color-primary)' : 'transparent',
      background: active ? 'var(--color-primary)' : 'transparent',
      color: active ? 'var(--color-on-primary)' : 'var(--color-text)',
      boxShadow: active ? 'var(--shadow-control)' : 'none'
    }}
    onMouseOver={(e) => {
      if (!active && !disabled) {
        e.currentTarget.style.background = 'var(--color-primary-soft)'
        e.currentTarget.style.borderColor = 'var(--color-primary)'
      }
    }}
    onMouseOut={(e) => {
      if (!active) {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.borderColor = 'transparent'
      }
    }}
  >
    {children}
  </button>
)

const Divider = () => (
  <div className="w-px h-5 mx-1 self-center" style={{ background: 'var(--color-border)' }} />
)

// ── Main Component ───────────────────────────────────────────────────
interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  onWikiLink?: (target: string) => void
  placeholder?: string
  minHeight?: string
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value,
  onChange,
  onWikiLink,
  placeholder = 'Write your notes here… Type [[ to insert a wikilink',
  minHeight = '240px'
}) => {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [showLinkDialog, setShowLinkDialog] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkText, setLinkText] = useState('')
  const [showShotMenu, setShowShotMenu] = useState(false)
  const shotMenuRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!showShotMenu) return
    const onDown = (event: MouseEvent): void => {
      if (!shotMenuRef.current?.contains(event.target as Node)) setShowShotMenu(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setShowShotMenu(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [showShotMenu])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  // The last Markdown this editor reported through onChange.
  const lastEmittedRef = useRef<string | null>(null)

  const editor = useEditor({
    extensions: createNoteExtensions({ placeholder }),
    contentType: 'markdown',
    content: value || '',
    editable: true,
    editorProps: {
      attributes: {
        class: 'obsidian-editor focus:outline-none',
        style: `min-height: ${minHeight}; padding: 1rem;`
      },
      // Pasted or dropped image files are saved into the data folder.
      handlePaste: (view, event) => {
        if (!view.editable || !isImageOnlyPaste(event.clipboardData)) return false
        event.preventDefault()
        void insertImageFiles(view, imageFilesFrom(event.clipboardData?.files))
        return true
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false
        const dropped = event.dataTransfer?.files
        // Never let a dropped file through: the window would navigate to it.
        if (!view.editable) return !!dropped?.length
        const files = imageFilesFrom(dropped)
        if (!files.length) {
          if (dropped?.length) notify('Only PNG, JPEG, GIF, WebP and BMP images can be added')
          return !!dropped?.length
        }
        event.preventDefault()
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
        void insertImageFiles(view, files, pos)
        return true
      }
    },
    onUpdate: ({ editor: e }) => {
      const markdown = e.getMarkdown()
      lastEmittedRef.current = markdown
      onChange(markdown)
    }
  })

  // Sync editable flag when mode changes
  useEffect(() => {
    if (editor) editor.setEditable(mode === 'edit')
  }, [mode, editor])

  // Sync external value (e.g. initial load from DB)
  useEffect(() => {
    // Only replace the document for a value the editor didn't produce itself
    // (e.g. a different task). Comparing with getMarkdown() would also fire
    // for saved text that was merely normalized, resetting the cursor.
    if (editor && value !== lastEmittedRef.current && value !== editor.getMarkdown()) {
      lastEmittedRef.current = value
      editor.commands.setContent(value || '', { emitUpdate: false, contentType: 'markdown' })
    }
  }, [value, editor])

  // Screenshots go into the editor used last; a newly opened one counts.
  useEffect(() => {
    if (!editor) return
    const target: ScreenshotTarget = {
      insertImages: (files) => insertImageFiles(editor.view, files),
      isAlive: () => !editor.isDestroyed && editor.view.dom.isConnected,
      isEditable: () => editor.isEditable
    }
    setScreenshotTarget(target)
    const onFocus = (): void => setScreenshotTarget(target)
    editor.on('focus', onFocus)
    return () => {
      editor.off('focus', onFocus)
      clearScreenshotTarget(target)
    }
  }, [editor])

  // WikiLink click listener
  useEffect(() => {
    if (!editor || !onWikiLink) return
    const el = editor.view.dom
    const handler = (e: Event) => onWikiLink((e as CustomEvent).detail)
    el.addEventListener('wikiLinkClick', handler)
    return () => el.removeEventListener('wikiLinkClick', handler)
  }, [editor, onWikiLink])

  const handleInsertLink = useCallback(() => {
    if (!editor) return
    const url = linkUrl.trim()
    if (!url) return
    const text = linkText.trim()
    if (text) {
      editor.chain().focus().insertContent(`<a href="${url}">${text}</a>`).run()
    } else {
      editor.chain().focus().setLink({ href: url }).run()
    }
    setLinkUrl('')
    setLinkText('')
    setShowLinkDialog(false)
  }, [editor, linkUrl, linkText])

  if (!editor) return null

  const isActive = (type: string, attrs?: Record<string, unknown>) => editor.isActive(type, attrs)

  return (
    <div
      className="border-2 overflow-hidden flex flex-col"
      style={{
        borderColor: 'var(--color-border-strong)',
        background: 'var(--color-surface)',
        boxShadow: 'var(--shadow-panel)'
      }}
    >
      {/* ── TOOLBAR ── */}
      <div
        className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b-2 shrink-0"
        style={{ borderColor: 'var(--color-border-strong)', background: 'var(--color-background)' }}
      >
        <ToolBtn
          onClick={() => editor.chain().focus().undo().run()}
          title="Undo (Ctrl+Z)"
          disabled={!editor.can().undo()}
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().redo().run()}
          title="Redo (Ctrl+Y)"
          disabled={!editor.can().redo()}
        >
          <RotateCw className="w-3.5 h-3.5" />
        </ToolBtn>
        <Divider />
        <ToolBtn
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={isActive('heading', { level: 1 })}
          title="Heading 1"
        >
          <Heading1 className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={isActive('heading', { level: 2 })}
          title="Heading 2"
        >
          <Heading2 className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={isActive('heading', { level: 3 })}
          title="Heading 3"
        >
          <Heading3 className="w-3.5 h-3.5" />
        </ToolBtn>
        <Divider />
        <ToolBtn
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={isActive('bold')}
          title="Bold (Ctrl+B)"
        >
          <Bold className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={isActive('italic')}
          title="Italic (Ctrl+I)"
        >
          <Italic className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={isActive('underline')}
          title="Underline (Ctrl+U)"
        >
          <UnderlineIcon className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={isActive('strike')}
          title="Strikethrough"
        >
          <Strikethrough className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          active={isActive('highlight')}
          title="Highlight"
        >
          <Highlighter className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().toggleCode().run()}
          active={isActive('code')}
          title="Inline Code"
        >
          <Code className="w-3.5 h-3.5" />
        </ToolBtn>
        <Divider />
        <ToolBtn
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={isActive('bulletList')}
          title="Bullet List"
        >
          <List className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={isActive('orderedList')}
          title="Ordered List"
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          active={isActive('taskList')}
          title="Task List (Ctrl+shift+9)"
        >
          <CheckSquare className="w-3.5 h-3.5" />
        </ToolBtn>
        <Divider />
        <ToolBtn
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={isActive('blockquote')}
          title="Blockquote"
        >
          <Quote className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          active={isActive('codeBlock')}
          title="Code Block"
        >
          <Type className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Horizontal Rule"
        >
          <Minus className="w-3.5 h-3.5" />
        </ToolBtn>
        <Divider />
        <ToolBtn
          onClick={() => {
            if (isActive('link')) {
              editor.chain().focus().unsetLink().run()
            } else {
              const { from, to } = editor.state.selection
              const selected = editor.state.doc.textBetween(from, to, ' ')
              setLinkText(selected)
              setShowLinkDialog(true)
            }
          }}
          active={isActive('link')}
          title="Link"
        >
          <Link2 className="w-3.5 h-3.5" />
        </ToolBtn>

        <ToolBtn
          onClick={() => fileInputRef.current?.click()}
          title="Add image (or paste / drop one into the notes)"
          disabled={mode !== 'edit'}
        >
          <ImagePlus className="w-3.5 h-3.5" />
        </ToolBtn>
        <div className="relative" ref={shotMenuRef}>
          <ToolBtn
            onClick={() => setShowShotMenu((open) => !open)}
            title="Screenshot into the notes (Alt+Shift+S for an area)"
            disabled={mode !== 'edit'}
          >
            <Camera className="w-3.5 h-3.5" />
          </ToolBtn>
          {showShotMenu && (
            <div
              className="context-menu absolute z-50 left-0 top-8 min-w-[170px]"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border-strong)',
                boxShadow: 'var(--shadow-window)'
              }}
            >
              {(
                [
                  ['area', 'Screenshot area', Crop],
                  ['full', 'Full screen', Monitor]
                ] as const
              ).map(([shotMode, label, Icon]) => (
                <button
                  key={shotMode}
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold hover:bg-primary-soft"
                  style={{ color: 'var(--color-text)' }}
                  onClick={() => {
                    setShowShotMenu(false)
                    editor.commands.focus()
                    void takeScreenshot(shotMode)
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/bmp"
          multiple
          hidden
          onChange={(event) => {
            const files = imageFilesFrom(event.target.files)
            event.target.value = ''
            if (files.length) void insertImageFiles(editor.view, files)
          }}
        />

        {/* WikiLink insert button */}
        <button
          type="button"
          title="Insert wikilink — or type [[ in editor"
          className="flex items-center px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border-2 transition-all ml-1"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-primary)' }}
          onClick={() => editor.chain().focus().insertContent('[[').run()}
        >
          {'[[…]]'}
        </button>

        <div className="flex-1" />

        {/* Edit / Preview toggle */}
        <div className="flex border-2" style={{ borderColor: 'var(--color-border-strong)' }}>
          <button
            type="button"
            onClick={() => setMode('edit')}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider transition-all"
            style={{
              background: mode === 'edit' ? 'var(--color-primary)' : 'transparent',
              color: mode === 'edit' ? 'var(--color-on-primary)' : 'var(--color-muted)'
            }}
          >
            <Edit3 className="w-3 h-3" />
            Edit
          </button>
          <button
            type="button"
            onClick={() => setMode('preview')}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider transition-all border-l-2"
            style={{
              borderColor: 'var(--color-border-strong)',
              background: mode === 'preview' ? 'var(--color-primary)' : 'transparent',
              color: mode === 'preview' ? 'var(--color-on-primary)' : 'var(--color-muted)'
            }}
          >
            <Eye className="w-3 h-3" />
            Preview
          </button>
        </div>
      </div>

      {/* ── LINK DIALOG ── */}
      {showLinkDialog && (
        <div
          className="flex items-center gap-2 px-3 py-2 border-b-2 shrink-0"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-background)' }}
        >
          <input
            type="text"
            value={linkText}
            onChange={(e) => setLinkText(e.target.value)}
            placeholder="Link text (optional)"
            className="flex-1 px-2 py-1 border-2 text-xs font-mono focus:outline-none"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            autoFocus
          />
          <input
            type="text"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleInsertLink()}
            placeholder="https://..."
            className="flex-1 px-2 py-1 border-2 text-xs font-mono focus:outline-none"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          />
          <button
            type="button"
            onClick={handleInsertLink}
            className="btn-primary text-xs px-3 py-1"
          >
            Insert
          </button>
          <button
            type="button"
            onClick={() => {
              setShowLinkDialog(false)
              setLinkUrl('')
              setLinkText('')
            }}
            className="text-xs font-bold px-2 py-1 border-2"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── CONTENT ── */}
      <EditorContent editor={editor} className="obsidian-content flex-1" />

      {/* ── HINT BAR ── */}
      {mode === 'edit' && (
        <div
          className="px-3 py-1.5 text-[9px] font-bold border-t-2 shrink-0"
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-muted)',
            background: 'var(--color-background)'
          }}
        >
          💡{' '}
          <code className="px-1 border" style={{ borderColor: 'var(--color-border)' }}>
            [[Task Name]]
          </code>{' '}
          wikilink · <kbd>Ctrl+B</kbd> bold · <kbd>Ctrl+I</kbd> italic ·{' '}
          <code className="px-1 border" style={{ borderColor: 'var(--color-border)' }}>
            - [ ]
          </code>{' '}
          task · paste or drop images
        </div>
      )}
    </div>
  )
}
