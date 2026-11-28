/**
 * Projects, boards, tasks, tags and statuses carry user-picked colours that
 * are drawn as text, icons, borders and tints. Many are dark (navy, deep
 * blue) and vanish on a dark background. `ink()` keeps a colour's hue but,
 * in dark mode, lifts its lightness to a readable level. It always returns
 * six-digit hex for hex input, so callers can append an alpha (`+ '15'`).
 */

/** Minimum OKLCH lightness for entity colours in dark mode. */
export const DARK_MIN_LIGHTNESS = 0.75

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGamma = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

const parseHex = (hex: string): [number, number, number] => {
  let h = hex.slice(1)
  if (h.length === 3) h = h.replace(/./g, (c) => c + c)
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number]
}

const toHex = (rgb: number[]): string =>
  '#' +
  rgb
    .map((c) =>
      Math.round(Math.min(1, Math.max(0, c)) * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')

/** sRGB (0..1) to OKLab. */
const rgbToOklab = ([r, g, b]: number[]): [number, number, number] => {
  const [lr, lg, lb] = [r, g, b].map(toLinear)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ]
}

/** OKLab to linear-free sRGB (0..1, may be out of gamut). */
const oklabToRgb = ([L, a, b]: number[]): number[] => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ].map(toGamma)
}

const inGamut = (rgb: number[]): boolean => rgb.every((c) => c >= -0.0005 && c <= 1.0005)

/** Raises a hex colour's OKLCH lightness to at least `minL`, keeping its hue. */
export const liftLightness = (hex: string, minL: number): string => {
  const [L, a, b] = rgbToOklab(parseHex(hex))
  if (L >= minL) return toHex(parseHex(hex))
  const chroma = Math.hypot(a, b)
  const hue = Math.atan2(b, a)
  // Reduce chroma until the lighter colour fits in sRGB.
  for (let c = chroma; c >= 0; c -= 0.005) {
    const rgb = oklabToRgb([minL, c * Math.cos(hue), c * Math.sin(hue)])
    if (inGamut(rgb)) return toHex(rgb)
  }
  return toHex(oklabToRgb([minL, 0, 0]))
}

const isDarkMode = (): boolean =>
  typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

const cache = new Map<string, string>()

/**
 * A readable version of an entity colour for the current theme. Non-hex
 * values (e.g. `var(--color-primary)`) are returned unchanged.
 */
export const ink = (color?: string | null, fallback = '#2563eb'): string => {
  const value = (color || fallback).trim()
  if (!HEX.test(value)) return value
  if (!isDarkMode()) return value.length === 4 ? toHex(parseHex(value)) : value
  let result = cache.get(value)
  if (!result) {
    result = liftLightness(value, DARK_MIN_LIGHTNESS)
    cache.set(value, result)
  }
  return result
}

/** OKLCH lightness of a hex colour (for tests and contrast decisions). */
export const lightnessOf = (hex: string): number => rgbToOklab(parseHex(hex))[0]

const relativeLuminance = (hex: string): number => {
  const [r, g, b] = parseHex(hex).map(toLinear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two hex colours. */
export const contrastRatio = (a: string, b: string): number => {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

export const LIGHT_TEXT = '#ffffff'
export const DARK_TEXT = '#14141c'

/**
 * Text colour for content drawn on a user-picked background (a task's
 * colour, a GitHub label): near-black or white, whichever reads better.
 * Non-hex backgrounds get the theme's on-primary colour.
 */
export const readableText = (background?: string | null): string => {
  const value = (background || '').trim()
  if (!HEX.test(value)) return 'var(--color-on-primary)'
  return contrastRatio(value, DARK_TEXT) >= contrastRatio(value, LIGHT_TEXT)
    ? DARK_TEXT
    : LIGHT_TEXT
}
