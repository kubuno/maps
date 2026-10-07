import { useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import type { GalleryImage } from './geocoding'

// Visionneuse d'images plein écran (façon viewer du Drive) : navigation
// précédent/suivant, fermeture (croix / clic fond / Échap), et la SOURCE de
// l'image affichée en bas (lien vers la page Wikimedia Commons).
export function MapsImageLightbox({
  images, index, onIndex, onClose,
}: {
  images: GalleryImage[]
  index:  number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const n = images.length
  const img = images[index]

  const prev = useCallback(() => onIndex((index - 1 + n) % n), [index, n, onIndex])
  const next = useCallback(() => onIndex((index + 1) % n), [index, n, onIndex])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, prev, next])

  if (!img) return null

  return createPortal(
    <div className="fixed inset-0 z-[3000] flex flex-col bg-black/90 backdrop-blur-sm" onClick={onClose}>
      {/* Barre haute */}
      <div className="flex items-center justify-between px-4 py-3 text-white/90 flex-shrink-0">
        <span className="text-xs">{index + 1} / {n}</span>
        <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/15" aria-label="Fermer"><X size={20} /></button>
      </div>

      {/* Image + flèches */}
      <div className="flex-1 min-h-0 flex items-center justify-center px-2 relative" onClick={e => e.stopPropagation()}>
        {n > 1 && (
          <button onClick={prev} className="absolute left-2 sm:left-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20" aria-label="Précédent"><ChevronLeft size={22} /></button>
        )}
        <img src={img.full} alt="" className="max-w-full max-h-full object-contain rounded"
          onError={e => { (e.target as HTMLImageElement).src = img.thumb }} />
        {n > 1 && (
          <button onClick={next} className="absolute right-2 sm:right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20" aria-label="Suivant"><ChevronRight size={22} /></button>
        )}
      </div>

      {/* Source (bas) */}
      <div className="flex-shrink-0 px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
        <a href={img.page} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-white/70 hover:text-white">
          <ExternalLink size={12} />
          {img.title ? `Source : ${img.title.replace(/_/g, ' ')} · Wikimedia Commons` : 'Source : Wikimedia Commons'}
        </a>
      </div>

      {/* Pellicule de vignettes */}
      {n > 1 && (
        <div className="flex-shrink-0 flex gap-1.5 overflow-x-auto px-4 pb-3 justify-center" onClick={e => e.stopPropagation()} style={{ scrollbarWidth: 'none' }}>
          {images.map((g, i) => (
            <button key={i} onClick={() => onIndex(i)}
              className={`flex-shrink-0 w-14 h-14 rounded overflow-hidden border-2 ${i === index ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'}`}>
              <img src={g.thumb} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  )
}
