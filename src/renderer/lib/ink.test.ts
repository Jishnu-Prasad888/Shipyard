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

describe('readableText', () => {
  it('picks the text colour with more contrast', async () => {
    const { readableText, contrastRatio, DARK_TEXT, LIGHT_TEXT } = await import('./ink')
    expect(readableText('#ffffff')).toBe(DARK_TEXT)
    expect(readableText('#c3b1ff')).toBe(DARK_TEXT) // pastel lavender
    expect(readableText('#10b981')).toBe(DARK_TEXT) // emerald
    expect(readableText('#1e3a8a')).toBe(LIGHT_TEXT) // navy
    expect(readableText('var(--color-primary)')).toBe('var(--color-on-primary)')
    for (const bg of ['#ef4444', '#3b82f6', '#8b5cf6', '#f59e0b', '#64748b', '#0ea5e9']) {
      const best = Math.max(contrastRatio(bg, DARK_TEXT), contrastRatio(bg, LIGHT_TEXT))
      expect(contrastRatio(bg, readableText(bg))).toBe(best)
      // Mid-tone colours sit near the crossover, where the better of the two
      // is only a little above 4:1.
      expect(best).toBeGreaterThanOrEqual(4)
    }
  })
})
