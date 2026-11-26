/**
 * The Tiptap extensions used for task notes. Notes are stored as Markdown;
 * the few things Markdown can't express (a highlight colour, an image's
 * resized width) are written as inline HTML, which Markdown allows and the
 * editor reads back.
 */
import { Extension, Mark, InputRule, type AnyExtension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import Typography from '@tiptap/extension-typography'
import { Markdown, MarkdownManager } from '@tiptap/markdown'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { AssetImage } from './AssetImage'

// The Markdown writer escapes inline delimiters (* _ ` [ ] ~) in plain text
// but not the ones our extensions add (== and ++), nor block markers at the
// start of a text run (# 1. - + >), so typed text like "1. not a list"
// would read back as formatting. Extend its escaping. The package version
// is pinned and noteExtensions.test.ts round-trips these cases.
const managerPrototype = MarkdownManager.prototype as unknown as {
  escapeMarkdownSyntax: (text: string) => string
  __shipyardEscaping?: boolean
}
if (!managerPrototype.__shipyardEscaping) {
  const escapeInline = managerPrototype.escapeMarkdownSyntax
  managerPrototype.escapeMarkdownSyntax = function (this: unknown, text: string): string {
    return escapeInline
      .call(this, text)
      .replace(/([=+])(?=\1)/g, '\\$1')
      .replace(/^(\s*)(#{1,6}|[-+>])(?=\s|$)/, '$1\\$2')
      .replace(/^(\s*\d+)([.)])(?=\s|$)/, '$1\\$2')
  }
  managerPrototype.__shipyardEscaping = true
}

const escapeAttr = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

// ── Wiki links: [[Page]] ─────────────────────────────────────────────

/** Click handling for wiki links (dispatches `wikiLinkClick` on the editor). */
const WikiLinkClick = Extension.create({
  name: 'wikiLinkExtension',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('wikiLinkClick'),
        props: {
          handleClick(view, _pos, event) {
            const target = event.target as HTMLElement
            if (target?.classList.contains('wiki-link')) {
              const text = target.getAttribute('data-target') || ''
              view.dom.dispatchEvent(
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

/** `[[text]]` in Markdown; a styled span in the editor. */
export const WikiLinkMark = Mark.create({
  name: 'wikiLinkMark',
  spanning: false,
  inclusive: false,

  addAttributes() {
    return {
      href: {
        default: '',
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-wiki-link') || element.getAttribute('href') || ''
      }
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

  renderMarkdown(node, helpers) {
    return `[[${helpers.renderChildren(node)}]]`
  },

  parseMarkdown(token, helpers) {
    return helpers.applyMark('wikiLinkMark', [{ type: 'text', text: token.text || '' }], {
      href: token.text || ''
    })
  },

  markdownTokenizer: {
    name: 'wikiLinkMark',
    level: 'inline',
    start(src) {
      return src.indexOf('[[')
    },
    tokenize(src) {
      const match = /^\[\[([^\]\n]+)\]\]/.exec(src)
      if (!match) return undefined
      return { type: 'wikiLinkMark', raw: match[0], text: match[1] }
    }
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\[\[([^\]]+)\]\]$/,
        handler: ({ state, range, match }) => {
          const linkText = match[1]
          state.tr.replaceWith(
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

// ── Highlight: ==text==, or <mark> when it has a colour ──────────────

const ColorHighlight = Highlight.extend({
  renderMarkdown(node: any, helpers: any) {
    const inner = helpers.renderChildren(node)
    const color = node.attrs?.color
    return color
      ? `<mark data-color="${escapeAttr(color)}" style="background-color: ${escapeAttr(color)}">${inner}</mark>`
      : `==${inner}==`
  }
}).configure({ multicolor: true })

export const createNoteExtensions = ({
  placeholder = ''
}: { placeholder?: string } = {}): AnyExtension[] => [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: false,
    underline: false
  }),
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
  ColorHighlight,
  Typography,
  WikiLinkMark,
  WikiLinkClick,
  AssetImage,
  Markdown.configure({ markedOptions: { gfm: true } })
]
