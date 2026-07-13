const BADGE_STYLES = {
  stable: 'bg-pastel-green/20 text-pastel-green',
  experimental: 'bg-pastel-yellow/20 text-pastel-yellow',
  deprecated: 'bg-pastel-red/20 text-pastel-red',
  since: 'bg-pastel-blue/20 text-pastel-blue',
}

const STATUS_LABELS = {
  stable: 'stable',
  experimental: '⚠ experimental',
  deprecated: 'deprecated',
}

export default function MetadataBadges({ metadata }) {
  if (!metadata) return null

  const badges = []
  if (metadata.stability) {
    badges.push({
      key: metadata.stability,
      label: STATUS_LABELS[metadata.stability] || metadata.stability,
      className: BADGE_STYLES[metadata.stability] || BADGE_STYLES.since,
    })
  }

  if (metadata.deprecated && metadata.stability !== 'deprecated') {
    badges.push({
      key: 'deprecated',
      label: STATUS_LABELS.deprecated,
      className: BADGE_STYLES.deprecated,
    })
  }

  if (metadata.since) {
    badges.push({
      key: 'since',
      label: `Since ${metadata.since}`,
      className: BADGE_STYLES.since,
    })
  }

  if (badges.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map(badge => (
        <span
          key={badge.key}
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}
        >
          {badge.label}
        </span>
      ))}
    </div>
  )
}
