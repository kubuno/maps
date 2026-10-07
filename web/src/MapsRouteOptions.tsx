import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Clock, AlertCircle } from 'lucide-react'
import { Checkbox, MenuDropdown, useMenuDropdown, type MenuItem } from '@ui'
import { hoverBg, BUTTON_HOVER } from './MapsSearchDropdown'
import type { AvoidSet, AvoidClass } from './useRouteModes'
import type { DistanceUnits } from './routing'

/**
 * When the user wants to travel. There is no traffic model nor timetable in
 * Kubuno, so this NEVER changes the routing request: the result cards only
 * derive "arrive around HH:MM" (departure + duration) or "leave around HH:MM"
 * (arrival − duration) from it.
 */
export type Schedule = { kind: 'now' } | { kind: 'depart' | 'arrive'; at: string }

/** `datetime-local` value of the next 5-minute mark. */
function nextSlot(): string {
  const d = new Date(Date.now() + 5 * 60_000)
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Schedule anchor as a Date (now, or the picked local time); null when unparsable. */
export function scheduleDate(s: Schedule): Date | null {
  if (s.kind === 'now') return new Date()
  const d = new Date(s.at)
  return isNaN(d.getTime()) ? null : d
}

/** "Leave now ▾" dropdown + "Options" disclosure (avoid classes, units). */
export function MapsRouteOptions({
  avoid, setAvoid, excludeUnsupported, showAvoid, units, setUnits, schedule, setSchedule,
}: {
  avoid:     AvoidSet
  setAvoid:  (a: AvoidSet) => void
  /** The routing server refused the avoid options (results computed without them). */
  excludeUnsupported: boolean
  /** Avoid options only make sense for road routing (hidden for the plane). */
  showAvoid: boolean
  units:     DistanceUnits
  setUnits:  (u: DistanceUnits) => void
  schedule:  Schedule
  setSchedule: (s: Schedule) => void
}) {
  const { t } = useTranslation('maps')
  const [open, setOpen] = useState(false)
  const menu = useMenuDropdown()

  const fmtTime = (iso: string) => {
    const d = new Date(iso)
    return isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(d)
  }
  const scheduleLabel = schedule.kind === 'now'
    ? t('maps_route_leave_now', { defaultValue: 'Partir maintenant' })
    : schedule.kind === 'depart'
      ? t('maps_route_depart_at', { defaultValue: 'Partir à {{time}}', time: fmtTime(schedule.at) })
      : t('maps_route_arrive_at', { defaultValue: 'Arriver à {{time}}', time: fmtTime(schedule.at) })

  const items: MenuItem[] = [
    { type: 'action', label: t('maps_route_leave_now', { defaultValue: 'Partir maintenant' }), checked: schedule.kind === 'now',
      onClick: () => setSchedule({ kind: 'now' }) },
    { type: 'action', label: t('maps_route_depart_at_menu', { defaultValue: 'Partir à…' }), checked: schedule.kind === 'depart',
      onClick: () => setSchedule({ kind: 'depart', at: schedule.kind === 'now' ? nextSlot() : schedule.at }) },
    { type: 'action', label: t('maps_route_arrive_at_menu', { defaultValue: 'Arriver à…' }), checked: schedule.kind === 'arrive',
      onClick: () => setSchedule({ kind: 'arrive', at: schedule.kind === 'now' ? nextSlot() : schedule.at }) },
  ]

  const avoidLabels: Record<AvoidClass, string> = {
    motorway: t('maps_route_avoid_motorways', { defaultValue: 'Éviter les autoroutes' }),
    toll:     t('maps_route_avoid_tolls',     { defaultValue: 'Éviter les péages' }),
    ferry:    t('maps_route_avoid_ferries',   { defaultValue: 'Éviter les ferries' }),
  }
  const link = 'flex items-center gap-1 h-9 px-3 rounded-full text-sm font-medium text-text-secondary'

  return (
    <div className="px-4 pt-2 no-print">
      <div className="flex items-center gap-2">
        <button type="button" onClick={e => menu.open(e)} {...hoverBg(BUTTON_HOVER)} className={link}>
          <Clock size={16} /> {scheduleLabel} <ChevronDown size={16} />
        </button>
        {schedule.kind !== 'now' && (
          <input
            type="datetime-local"
            value={schedule.at}
            onChange={e => setSchedule({ kind: schedule.kind, at: e.target.value })}
            aria-label={scheduleLabel}
            className="h-9 px-2 rounded-lg border border-border bg-surface-0 text-sm text-text-primary focus:outline-none focus:border-primary"
          />
        )}
        <button type="button" onClick={() => setOpen(o => !o)} {...hoverBg(BUTTON_HOVER)} className={`${link} ml-auto`}
          aria-expanded={open}>
          {t('maps_route_options', { defaultValue: 'Options' })} {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      {menu.isOpen && menu.pos && <MenuDropdown items={items} pos={menu.pos} onClose={menu.close} minWidth={200} />}

      {open && (
        <div className="flex flex-col gap-2 px-1 pt-2 pb-1">
          {showAvoid && (
            <div className="flex flex-col gap-1.5">
              {(['motorway', 'toll', 'ferry'] as AvoidClass[]).map(k => (
                <Checkbox key={k} checked={avoid[k]} onChange={v => setAvoid({ ...avoid, [k]: v })}
                  label={avoidLabels[k]} labelClassName="text-sm" />
              ))}
              {excludeUnsupported && (
                <p className="text-sm text-text-secondary flex items-start gap-1.5 pt-1">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  {t('maps_route_exclude_unsupported', { defaultValue: "Le serveur d'itinéraires ne prend pas en charge ces options" })}
                </p>
              )}
            </div>
          )}
          <div className="flex items-center gap-3 pt-1">
            <span className="text-sm text-text-secondary">{t('maps_route_units', { defaultValue: 'Unités' })}</span>
            <div className="flex rounded-full border border-border overflow-hidden">
              {(['km', 'miles'] as DistanceUnits[]).map(u => (
                <button key={u} type="button" onClick={() => setUnits(u)} aria-pressed={units === u}
                  className={`h-8 px-3 text-sm font-medium ${units === u ? 'bg-primary-light text-primary' : 'text-text-secondary'}`}>
                  {u === 'km' ? 'km' : 'mi'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
