import { describe, expect, it } from 'vitest'
import {
  formatRef,
  normalizeRepo,
  parseGitHubReferences,
  parseSingleReference,
  parseStoredLinks,
  taskReferences
} from './github'

describe('normalizeRepo', () => {
  it('accepts owner/repo, URLs and clone URLs', () => {
    expect(normalizeRepo('octo/hello')).toBe('octo/hello')
    expect(normalizeRepo('https://github.com/octo/hello/')).toBe('octo/hello')
    expect(normalizeRepo('https://github.com/octo/hello/issues/3')).toBe('octo/hello')
    expect(normalizeRepo('git@github.com:octo/hello.git')).toBe('octo/hello')
    expect(normalizeRepo('github.com/octo/hello.js')).toBe('octo/hello.js')
  })

  it('rejects junk', () => {
    expect(normalizeRepo('')).toBeNull()
    expect(normalizeRepo('just-a-name')).toBeNull()
    expect(normalizeRepo('-bad/repo')).toBeNull()
  })
})

describe('parseGitHubReferences', () => {
  it('finds URLs, qualified refs and commits', () => {
    const refs = parseGitHubReferences(
      'See https://github.com/octo/app/pull/42 and octo/lib#7, fixed in octo/app@1a2b3c4d.'
    )
    expect(refs).toEqual([
      { kind: 'issue', repo: 'octo/app', number: 42 },
      { kind: 'issue', repo: 'octo/lib', number: 7 },
      { kind: 'commit', repo: 'octo/app', sha: '1a2b3c4d' }
    ])
  })

  it('uses the default repo for #N and ignores it without one', () => {
    expect(parseGitHubReferences('Blocked by #12 (see #13)', 'octo/app')).toEqual([
      { kind: 'issue', repo: 'octo/app', number: 12 },
      { kind: 'issue', repo: 'octo/app', number: 13 }
    ])
    expect(parseGitHubReferences('Blocked by #12')).toEqual([])
  })

  it('reads note HTML without matching attributes or duplicating links', () => {
    const html =
      '<p style="color:#123">Ship <a href="https://github.com/octo/app/issues/5">octo/app#5</a></p>'
    expect(parseGitHubReferences(html, 'octo/app')).toEqual([
      { kind: 'issue', repo: 'octo/app', number: 5 }
    ])
  })

  it('does not treat colors, anchors or words as references', () => {
    expect(parseGitHubReferences('color #fff, page#3, a/b/c#4', 'octo/app')).toEqual([])
  })
})

describe('parseSingleReference', () => {
  it('understands short forms against a default repo', () => {
    expect(parseSingleReference('#9', 'octo/app')).toEqual({
      kind: 'issue',
      repo: 'octo/app',
      number: 9
    })
    expect(parseSingleReference('9', 'octo/app')?.number).toBe(9)
    expect(parseSingleReference('deadbeef1', 'octo/app')).toEqual({
      kind: 'commit',
      repo: 'octo/app',
      sha: 'deadbeef1'
    })
    expect(parseSingleReference('other/repo#2', 'octo/app')?.repo).toBe('other/repo')
    expect(parseSingleReference('nothing here', 'octo/app')).toBeNull()
  })
})

describe('task references', () => {
  it('lists linked refs first and does not repeat mentioned ones', () => {
    const refs = taskReferences(
      {
        title: 'Fix login (#4)',
        notes: '<p>Related: #4 and #8</p>',
        githubLinks: JSON.stringify([{ kind: 'issue', repo: 'octo/app', number: 4 }])
      },
      'octo/app'
    )
    expect(refs.map((r) => [formatRef(r.ref, 'octo/app'), r.linked])).toEqual([
      ['#4', true],
      ['#8', false]
    ])
  })

  it('drops malformed stored links', () => {
    expect(
      parseStoredLinks([
        { kind: 'issue', repo: 'octo/app', number: 1 },
        { kind: 'issue', repo: 'bad', number: 1 },
        { kind: 'commit', repo: 'octo/app', sha: 'xyz' },
        null
      ])
    ).toHaveLength(1)
    expect(parseStoredLinks('not json')).toEqual([])
  })

  it('handles review edge cases: trailing slashes, #0, colours', () => {
    expect(normalizeRepo('https://github.com/octo/hello.git/')).toBe('octo/hello')
    expect(normalizeRepo('https://github.com/octo/hello?tab=readme-ov-file#readme')).toBe(
      'octo/hello'
    )
    expect(parseSingleReference('#0', 'octo/hello')).toBeNull()
    expect(parseSingleReference('0', 'octo/hello')).toBeNull()
    expect(parseGitHubReferences('use #000000 or #0f0 for text', 'octo/hello')).toEqual([])
    expect(parseGitHubReferences('fixes #12', 'octo/hello')).toEqual([
      { kind: 'issue', repo: 'octo/hello', number: 12 }
    ])
  })
})
