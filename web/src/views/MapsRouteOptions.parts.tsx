/**
 * React part of `MapsRouteOptions.kbview`: the `datetime-local` field (no .kbview input type for it).
 * Rendered by a `<ReactHost>` with its value/handler as props.
 */
export function ScheduleInput({ value, label, onChange }: { value: string; label: string; onChange: (v: string) => void }) {
  return (
    <input
      type="datetime-local"
      value={value}
      onChange={e => onChange(e.target.value)}
      aria-label={label}
      className="h-9 px-2 rounded-lg border border-border bg-surface-0 text-sm text-text-primary focus:outline-none focus:border-primary"
    />
  )
}
