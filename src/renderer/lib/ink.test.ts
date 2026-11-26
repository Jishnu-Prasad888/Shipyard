// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { DARK_MIN_LIGHTNESS, ink, liftLightness, lightnessOf } from './ink'

afterEach(() => document.documentElement.classList.remove('dark'))

describe('ink', () => {
  it('leaves colours alone in light mode (3-digit hex is expanded)', () => {
    expect(ink('#0b2545')).toBe('#0b2545')
    expect(ink('#abc')).toBe('#aabbcc')
    expect(ink(undefined)).toBe('#2563eb')
    expect(ink(null, '#123456')).toBe('#123456')
  })

  it('lifts dark colours in dark mode, keeping light ones', () => {
    document.documentElement.classList.add('dark')
    for (const dark of ['#0b2545', '#2563eb', '#111827', '#7c3aed', '#be123c']) {
      const lifted = ink(dark)
      expect(lifted).toMatch(/^#[0-9a-f]{6}$/)
      expect(lightnessOf(lifted)).toBeGreaterThanOrEqual(DARK_MIN_LIGHTNESS - 0.01)
    }
    expect(ink('#ffb86c')).toBe('#ffb86c')
  })

  it('keeps the hue family when lifting', () => {
    const blue = liftLightness('#1d4ed8', 0.75)
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(blue.slice(i, i + 2), 16))
    expect(b).toBeGreaterThan(r)
    expect(b).toBeGreaterThan(g)
  })

  it('passes CSS variables and other values through', () => {
    document.documentElement.classList.add('dark')
    expect(ink('var(--color-primary)')).toBe('var(--color-primary)')
    expect(ink('red')).toBe('red')
  })
})
