// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { createNoteExtensions } from './noteExtensions'

// Image node views look up stored images through the app bridge.
;(window as any).electron = { assets: { read: async () => null } }

const editors: Editor[] = []
const makeEditor = (content: string, contentType: 'markdown' | 'html'): Editor => {
  const editor = new Editor({ extensions: createNoteExtensions(), content, contentType })
  editors.push(editor)
  return editor
}
afterEach(() => {
  while (editors.length) editors.pop()!.destroy()
})

/** Markdown written by the editor reads back as the same document. */
const expectRoundTrip = (html: string): string => {
  const original = makeEditor(html, 'html')
  const markdown = original.getMarkdown()
  const reread = makeEditor(markdown, 'markdown')
  // An unset highlight colour may read back as "" or null; both mean none.
  const normalize = (editor: Editor) =>
    JSON.parse(JSON.stringify(editor.getJSON()).replace(/"color":""/g, '"color":null'))
  expect(normalize(reread)).toEqual(normalize(original))
  // Saving again without changes gives the same text (no drift).
  expect(reread.getMarkdown()).toBe(markdown)
  return markdown
}

describe('notes as Markdown', () => {
  it('round-trips the basic formatting', () => {
    const markdown = expectRoundTrip(
      '<h1>Plan</h1><p>Some <strong>bold</strong>, <em>italic</em>, <s>gone</s> and <code>code</code>.</p>' +
        '<h2>Steps</h2><ul><li><p>one</p></li><li><p>two</p><ul><li><p>nested</p></li></ul></li></ul>' +
        '<ol><li><p>first</p></li><li><p>second</p></li></ol>' +
        '<blockquote><p>quoted</p></blockquote><hr><pre><code>let x = 1</code></pre>' +
        '<p><a href="https://example.com">a link</a></p>'
    )
    expect(markdown).toContain('# Plan')
    expect(markdown).toContain('**bold**')
    expect(markdown).toContain('[a link](https://example.com)')
  })

  it('round-trips checklists', () => {
    const markdown = expectRoundTrip(
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>done</p></li>' +
        '<li data-type="taskItem" data-checked="false"><p>todo</p></li></ul>'
    )
    expect(markdown).toMatch(/- \[x\] done/)
    expect(markdown).toMatch(/- \[ \] todo/)
  })

  it('round-trips underline, highlights and wiki links', () => {
    const markdown = expectRoundTrip(
      '<p><u>under</u> <mark>marked</mark> <mark data-color="#fde68a">yellow</mark> see ' +
        '<span data-wiki-link="Roadmap">Roadmap</span></p>'
    )
    expect(markdown).toContain('++under++')
    expect(markdown).toContain('==marked==')
    expect(markdown).toContain('[[Roadmap]]')
  })

  it('round-trips images, keeping a resized width', () => {
    const markdown = expectRoundTrip(
      '<img src="shipyard-asset:abc.png" alt="diagram">' +
        '<img src="shipyard-asset:def.png" alt="small" width="240">'
    )
    expect(markdown).toContain('![diagram](shipyard-asset:abc.png)')
    expect(markdown).toContain('width="240"')
  })

  it('reads hand-written Markdown', () => {
    const editor = makeEditor('Intro\n\n- [ ] call [[Alice]]\n- [x] ship it\n', 'markdown')
    const json = JSON.stringify(editor.getJSON())
    expect(json).toContain('taskItem')
    expect(json).toContain('wikiLinkMark')
  })

  it('writes nothing for empty notes', () => {
    expect(makeEditor('', 'markdown').getMarkdown().trim()).toBe('')
  })
})
