import React from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Bold, Italic, List, ListOrdered, Code, Heading2 } from 'lucide-react'

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({ value, onChange }) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Write your notes here...'
      })
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    }
  })

  if (!editor) {
    return null
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex gap-1 p-2 border-b border-border bg-surface">
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`p-2 rounded hover:bg-primary-soft transition ${
            editor.isActive('heading', { level: 2 }) ? 'bg-primary-soft text-primary' : ''
          }`}
        >
          <Heading2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-2 rounded hover:bg-primary-soft transition ${
            editor.isActive('bold') ? 'bg-primary-soft text-primary' : ''
          }`}
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-2 rounded hover:bg-primary-soft transition ${
            editor.isActive('italic') ? 'bg-primary-soft text-primary' : ''
          }`}
        >
          <Italic className="w-4 h-4" />
        </button>
        <div className="w-px bg-border mx-1" />
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`p-2 rounded hover:bg-primary-soft transition ${
            editor.isActive('bulletList') ? 'bg-primary-soft text-primary' : ''
          }`}
        >
          <List className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`p-2 rounded hover:bg-primary-soft transition ${
            editor.isActive('orderedList') ? 'bg-primary-soft text-primary' : ''
          }`}
        >
          <ListOrdered className="w-4 h-4" />
        </button>
        <div className="w-px bg-border mx-1" />
        <button
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={`p-2 rounded hover:bg-primary-soft transition ${
            editor.isActive('codeBlock') ? 'bg-primary-soft text-primary' : ''
          }`}
        >
          <Code className="w-4 h-4" />
        </button>
      </div>

      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none p-4 min-h-[200px] focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[180px]"
      />
    </div>
  )
}
