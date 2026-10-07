import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MapPin, X } from 'lucide-react'
import { Button, Input, Textarea } from '@ui'

// Modal to name and note a point before saving it to the user's places.

export function SavePlaceModal({
  lat, lng, defaultName, onSave, onClose,
}: {
  lat: number; lng: number
  defaultName: string
  onSave:  (name: string, note: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation('maps')
  const [name, setName] = useState(defaultName)
  const [note, setNote] = useState('')

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/20">
      <div className="bg-surface-0 rounded-xl shadow-xl border border-border p-5 w-80 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <MapPin size={16} className="text-primary" /> {t('maps_save_place')}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-surface-2 text-text-tertiary"><X size={15} /></button>
        </div>
        <p className="text-xs text-text-tertiary font-mono">{lat.toFixed(6)}, {lng.toFixed(6)}</p>
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t('maps_place_name')}
          autoFocus
        />
        <Textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder={t('maps_note_optional')}
          rows={2}
          className="h-auto min-h-0 resize-none"
        />
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>{t('common_cancel')}</Button>
          <Button
            size="sm"
            onClick={() => { if (name.trim()) onSave(name.trim(), note.trim()) }}
            disabled={!name.trim()}
          >
            {t('common_save')}
          </Button>
        </div>
      </div>
    </div>
  )
}
