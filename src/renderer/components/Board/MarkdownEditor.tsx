import React, { useCallback, useEffect, useState } from 'react'
import { useEditor, EditorContent, Extension, Mark } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import Typography from '@tiptap/extension-typography'
import { InputRule } from '@tiptap/core'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3,
  List, ListOrdered, CheckSquare, Code, Quote,
  Link2, Highlighter, Type, Eye, Edit3, Minus,
  RotateCcw, RotateCw
} from 'lucide-react'
import { Plugin, PluginKey } from '@tiptap/pm/state'

// ── WikiLink Extension (click handler via ProseMirror plugin) ────────
const WikiLinkExtension = Extension.create({
  name: 'wikiLinkExtension',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('wikiLinkClick'),
        props: {
          handleClick(_view, _pos, event) {
            const target = event.target as HTMLElement
            if (target?.classList.contains('wiki-link')) {
              const text = target.getAttribute('data-target') || ''
              _view.dom.dispatchEvent(
                new CustomEvent('wikiLinkClick', { detail: text, bubbles: true })
              )
              return true
            }
            return false
          }
        }
      })
    ]
  }
})

// ── WikiLink Mark (renders [[text]] → styled span) ───────────────────
const WikiLinkMark = Mark.create({
  name: 'wikiLinkMark',
  spanning: false,
  inclusive: false,

  addAttributes() {
    return {
      href: { default: '' }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-wiki-link]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      {
        ...HTMLAttributes,
        'data-wiki-link': HTMLAttributes.href,
        'data-target': HTMLAttributes.href,
        class: 'wiki-link'
      },
      0
    ]
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\[\[([^\]]+)\]\]$/,
        handler: ({ state, range, match }) => {
          const { tr } = state
          const linkText = match[1]
          tr.replaceWith(
            range.from,
            range.to,
            state.schema.text(linkText, [
              state.schema.marks.wikiLinkMark.create({ href: linkText })
            ])
          )
        }
      })
    ]
  }
})

// ── Toolbar Button ───────────────────────────────────────────────────
const ToolBtn = ({
  onClick, active, title, children, disabled = false
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
      color: active ? 'white' : 'var(--color-text)',
      boxShadow: active ? '2px 2px 0 var(--color-border-strong)' : 'none'
    }}
    onMouseOver={e => {
      if (!active && !disabled) {
        e.currentTarget.style.background = 'var(--color-primary-soft)'
        e.currentTarget.style.borderColor = 'var(--color-primary)'
      }
    }}
    onMouseOut={e => {
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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'md-link', rel: 'noopener noreferrer', target: '_blank' },
        autolink: true,
        linkOnPaste: true
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Underline,
      Highlight.configure({ multicolor: true }),
      Typography,
      WikiLinkMark,
      WikiLinkExtension
    ],
    content: value || '',
    editable: true,
    editorProps: {
      attributes: {
        class: 'obsidian-editor focus:outline-none',
        style: `min-height: ${minHeight}; padding: 1rem;`
      }
    },
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML())
    }
  })

  // Sync editable flag when mode changes
  useEffect(() => {
    if (editor) editor.setEditable(mode === 'edit')
  }, [mode, editor])

  // Sync external value (e.g. initial load from DB)
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '', false)
    }
  }, [value, editor])

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

  const isActive = (type: string, attrs?: Record<string, unknown>) =>
    editor.isActive(type, attrs)

  return (
    <div
      className="border-2 overflow-hidden flex flex-col"
      style={{
        borderColor: 'var(--color-border-strong)',
        background: 'var(--color-surface)',
        boxShadow: '3px 3px 0 var(--color-border)'
      }}
    >
      {/* ── TOOLBAR ── */}
      <div
        className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b-2 shrink-0"
        style={{ borderColor: 'var(--color-border-strong)', background: 'var(--color-background)' }}
      >
        <ToolBtn onClick={() => editor.chain().focus().undo().run()} title="Undo (Ctrl+Z)" disabled={!editor.can().undo()}>
          <RotateCcw className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().redo().run()} title="Redo (Ctrl+Y)" disabled={!editor.can().redo()}>
          <RotateCw className="w-3.5 h-3.5" />
        </ToolBtn>
        <Divider />
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={isActive('heading', { level: 1 })} title="Heading 1">
          <Heading1 className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={isActive('heading', { level: 2 })} title="Heading 2">
          <Heading2 className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={isActive('heading', { level: 3 })} title="Heading 3">
          <Heading3 className="w-3.5 h-3.5" />
        </ToolBtn>
        <Divider />
        <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={isActive('bold')} title="Bold (Ctrl+B)">
          <Bold className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={isActive('italic')} title="Italic (Ctrl+I)">
          <Italic className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={isActive('underline')} title="Underline (Ctrl+U)">
          <UnderlineIcon className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={isActive('strike')} title="Strikethrough">
          <Strikethrough className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleHighlight().run()} active={isActive('highlight')} title="Highlight">
          <Highlighter className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleCode().run()} active={isActive('code')} title="Inline Code">
          <Code className="w-3.5 h-3.5" />
        </ToolBtn>
        <Divider />
        <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={isActive('bulletList')} title="Bullet List">
          <List className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={isActive('orderedList')} title="Ordered List">
          <ListOrdered className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleTaskList().run()} active={isActive('taskList')} title="Task List (Ctrl+shift+9)">
          <CheckSquare className="w-3.5 h-3.5" />
        </ToolBtn>
        <Divider />
        <ToolBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={isActive('blockquote')} title="Blockquote">
          <Quote className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={isActive('codeBlock')} title="Code Block">
          <Type className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal Rule">
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
              color: mode === 'edit' ? 'white' : 'var(--color-muted)'
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
              color: mode === 'preview' ? 'white' : 'var(--color-muted)'
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
            onChange={e => setLinkText(e.target.value)}
            placeholder="Link text (optional)"
            className="flex-1 px-2 py-1 border-2 text-xs font-mono focus:outline-none"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            autoFocus
          />
          <input
            type="text"
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleInsertLink()}
            placeholder="https://..."
            className="flex-1 px-2 py-1 border-2 text-xs font-mono focus:outline-none"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          />
          <button type="button" onClick={handleInsertLink} className="btn-primary text-xs px-3 py-1">
            Insert
          </button>
          <button
            type="button"
            onClick={() => { setShowLinkDialog(false); setLinkUrl(''); setLinkText('') }}
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
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)', background: 'var(--color-background)' }}
        >
          💡{' '}
          <code className="px-1 border" style={{ borderColor: 'var(--color-border)' }}>[[Card Name]]</code>{' '}
          wikilink · <kbd>Ctrl+B</kbd> bold · <kbd>Ctrl+I</kbd> italic ·{' '}
          <code className="px-1 border" style={{ borderColor: 'var(--color-border)' }}>- [ ]</code>{' '}task
        </div>
      )}
    </div>
  )
}
