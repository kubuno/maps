import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Bookmark, BookmarkCheck, Locate, Smartphone, Share2, Link, Copy } from 'lucide-react'
import { MenuDropdown, useMenuDropdown, useToast, type MenuItem } from '@ui'
import type { SearchResult } from './geocoding'
import { DirectionsIcon } from './DirectionsIcon'
import { copyKubunoData, placeEnvelope } from './kubunoData'
import { MapsQrDialog } from './MapsQrDialog'

/**
 * Hover background driven from JS: this module's Tailwind build lands in the
 * `kubuno-module` cascade layer, below the host's `utilities` layer, so a
 * `hover:bg-*` utility may never paint. An inline style is immune to the race
 * (same workaround as MapsSidebarBody).
 */
export const hoverBg = (color: string) => ({
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.backgroundColor = color },
  onMouseLeave: (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.backgroundColor = '' },
})

/** Share URL of a place: opens the module centred on it with the name pre-filled. */
export function placeShareUrl(lat: number, lng: number, title: string): string {
  return `${location.origin}/maps?ll=${lat.toFixed(6)},${lng.toFixed(6)}&q=${encodeURIComponent(title)}`
}

// One round action: 56 px circle + 12 px primary label underneath.
function RoundAction({ icon, label, onClick, filled }: { icon: ReactNode; label: string; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; filled?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-1.5 min-w-0 group outline-none">
      <span className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${filled ? 'bg-primary text-white' : 'bg-primary-light text-primary'}`}
        {...hoverBg(filled ? 'var(--color-primary-hover)' : '#c2d7fa')}>
        {icon}
      </span>
      <span className="text-xs leading-tight text-primary text-center px-0.5 break-words max-w-full">{label}</span>
    </button>
  )
}

/** Row of five round actions + the « send to phone » QR dialog. */
export function MapsPlaceActions({
  place, lat, lng, title, saved, onRouteTo, onSave, onNearby,
}: {
  place:     SearchResult
  lat:       number
  lng:       number
  title:     string
  saved:     boolean
  onRouteTo: () => void
  onSave:    () => void
  onNearby?: () => void
}) {
  const { t } = useTranslation('maps')
  const toast = useToast()
  const menu = useMenuDropdown()
  const [qrOpen, setQrOpen] = useState(false)
  const url = placeShareUrl(lat, lng, title)

  const copyLink = () => {
    navigator.clipboard?.writeText(url).catch(() => {})
    toast.success(t('maps_place_link_copied', { defaultValue: 'Lien copié' }), { id: 'maps-share' })
  }
  // Cross-module copy: a JSON envelope pasteable as a rich card in chat, documents…
  const copyCard = () => {
    copyKubunoData(placeEnvelope(place)).catch(() => {})
    toast.success(t('maps_place_card_copied', { defaultValue: 'Fiche du lieu copiée' }), { id: 'maps-share' })
  }
  const shareItems: MenuItem[] = [
    { type: 'action', label: t('maps_place_copy_link', { defaultValue: 'Copier le lien' }), icon: <Link size={15} />, onClick: copyLink },
    { type: 'action', label: t('maps_place_copy_card', { defaultValue: 'Copier la fiche (à coller dans un autre module)' }), icon: <Copy size={15} />, onClick: copyCard },
  ]

  return (
    <>
      <div className="grid grid-cols-5 gap-1 px-2 pt-4 pb-3">
        <RoundAction filled icon={<DirectionsIcon size={24} />} label={t('maps_place_directions', { defaultValue: 'Itinéraires' })} onClick={onRouteTo} />
        <RoundAction icon={saved ? <BookmarkCheck size={22} /> : <Bookmark size={22} />}
          label={saved ? t('maps_place_saved', { defaultValue: 'Enregistré' }) : t('maps_save', { defaultValue: 'Enregistrer' })} onClick={onSave} />
        <RoundAction icon={<Locate size={22} />} label={t('maps_nearby', { defaultValue: 'À proximité' })} onClick={() => onNearby?.()} />
        <RoundAction icon={<Smartphone size={22} />} label={t('maps_place_send_to_phone', { defaultValue: 'Envoyer vers un téléphone' })} onClick={() => setQrOpen(true)} />
        <RoundAction icon={<Share2 size={22} />} label={t('maps_share', { defaultValue: 'Partager' })} onClick={e => menu.open(e)} />
      </div>
      {menu.isOpen && menu.pos && <MenuDropdown items={shareItems} pos={menu.pos} onClose={menu.close} minWidth={240} />}
      {qrOpen && (
        <MapsQrDialog url={url} title={title} onClose={() => setQrOpen(false)} onCopy={copyLink}
          hint={t('maps_place_send_to_phone_hint', { defaultValue: "Scannez ce code avec l'appareil photo de votre téléphone pour ouvrir ce lieu dans Kubuno." })} />
      )}
    </>
  )
}
