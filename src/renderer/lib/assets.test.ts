import { describe, expect, it } from 'vitest'
import { ASSET_PREFIX, assetNameFromRef, imageExtension, isAssetRef } from './assets'

describe('asset helpers', () => {
  it('recognises asset references', () => {
    expect(isAssetRef(`${ASSET_PREFIX}abc.png`)).toBe(true)
    expect(isAssetRef('https://example.com/a.png')).toBe(false)
    expect(isAssetRef(undefined)).toBe(false)
    expect(assetNameFromRef(`${ASSET_PREFIX}abc.png`)).toBe('abc.png')
  })

  it('picks an extension from the MIME type or file name', () => {
    expect(imageExtension({ type: 'image/png' })).toBe('png')
    expect(imageExtension({ type: 'image/jpeg' })).toBe('jpg')
    expect(imageExtension({ type: '', name: 'Photo.JPEG' })).toBe('jpeg')
    expect(imageExtension({ type: 'image/svg+xml', name: 'x.svg' })).toBeNull()
    expect(imageExtension({ type: 'application/pdf', name: 'doc.pdf' })).toBeNull()
  })
})
