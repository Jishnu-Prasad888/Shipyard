import Image from '@tiptap/extension-image'
import { isAssetRef, resolveAssetUrl } from '../../lib/assets'

/**
 * Tiptap image node that understands `shipyard-asset:<name>` sources (images
 * stored in the data folder) and can be resized by dragging its corners.
 * The note HTML keeps the asset reference; only the displayed `<img>` gets a
 * temporary object URL.
 */
export const AssetImage = Image.extend({
  addNodeView() {
    const parent = this.parent?.()
    if (!parent) return null
    return (props) => {
      const view = parent(props)
      const dom = view.dom as HTMLElement
      const img = (
        dom.tagName === 'IMG' ? dom : dom.querySelector('img')
      ) as HTMLImageElement | null
      const src = props.node.attrs.src as string | null
      if (img && isAssetRef(src)) {
        img.removeAttribute('src')
        void resolveAssetUrl(src!).then((url) => {
          if (url) {
            img.src = url
            return
          }
          // Missing file (deleted, or a share that is offline): show why.
          img.alt = 'Image not found in this folder'
          img.classList.add('asset-image-missing')
          dom.style.visibility = ''
          dom.style.pointerEvents = ''
        })
      }
      return view
    }
  }
}).configure({
  inline: false,
  allowBase64: false,
  HTMLAttributes: { class: 'note-image' },
  resize: {
    enabled: true,
    directions: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
    minWidth: 48,
    minHeight: 48,
    alwaysPreserveAspectRatio: true
  }
})
