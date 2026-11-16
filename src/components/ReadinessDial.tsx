// Readiness dial: four computed operational axes from the current records.
// It is a data chart, not a radar scope — no positions or contacts are implied.
export function ReadinessDial({
  axes,
  size = 220,
}: {
  axes: { label: string; value: number; detail: string }[]
  size?: number
}) {
  const center = size / 2
  const radius = center - 30
  const count = axes.length
  const point = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2
    return [center + Math.cos(angle) * radius * value, center + Math.sin(angle) * radius * value] as const
  }
  const polygon = axes.map((axis, index) => point(index, Math.max(0.04, Math.min(1, axis.value))).join(',')).join(' ')

  return (
    <svg width="100%" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Operational readiness across four axes">
      {[0.25, 0.5, 0.75, 1].map((ring) => (
        <polygon
          key={ring}
          points={axes.map((_, index) => point(index, ring).join(',')).join(' ')}
          fill="none"
          stroke="var(--line)"
          strokeWidth={ring === 1 ? 1 : 0.6}
        />
      ))}
      {axes.map((axis, index) => {
        const [x, y] = point(index, 1)
        return <line key={axis.label} x1={center} y1={center} x2={x} y2={y} stroke="var(--line)" strokeWidth="0.6" />
      })}
      <polygon points={polygon} fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="1.4" />
      {axes.map((axis, index) => {
        const [x, y] = point(index, Math.max(0.04, Math.min(1, axis.value)))
        return <circle key={`${axis.label}-dot`} cx={x} cy={y} r="2.4" fill="var(--accent)" />
      })}
      {axes.map((axis, index) => {
        const angle = (Math.PI * 2 * index) / count - Math.PI / 2
        const lx = center + Math.cos(angle) * (radius + 17)
        const ly = center + Math.sin(angle) * (radius + 17)
        return (
          <text
            key={`${axis.label}-label`}
            x={lx}
            y={ly}
            textAnchor={Math.abs(Math.cos(angle)) < 0.2 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end'}
            dominantBaseline="middle"
            className="dial-label"
          >
            {axis.label}
          </text>
        )
      })}
    </svg>
  )
}
