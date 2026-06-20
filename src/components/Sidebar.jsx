const CATEGORY_ORDER = ['language', 'container', 'io', 'math', 'algorithm', 'traits', 'concurrency', 'parallelism']
const CATEGORY_LABELS = {
  language: 'Built-ins',
  math: 'Math',
  container: 'Containers',
  io: 'I/O',
  algorithm: 'Algorithms',
  traits: 'Traits',
  concurrency: 'Concurrency',
  parallelism: 'Parallelism',
}

function StabilityDot({ stability }) {
  const color = stability === 'stable' ? 'bg-pastel-green' : 'bg-pastel-yellow'
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${color} mr-1.5`} />
}

export default function Sidebar({ modules, active, onSelect, onClose }) {
  const grouped = {}
  for (const mod of modules) {
    const cat = mod.category || 'other'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(mod)
  }

  // Sort modules within each category alphabetically
  for (const cat in grouped) {
    grouped[cat].sort((a, b) => a.name.localeCompare(b.name))
  }

  // Ordered categories first, then any remaining categories alphabetically
  const ordered = CATEGORY_ORDER.filter(c => grouped[c])
  const remaining = Object.keys(grouped).filter(c => !CATEGORY_ORDER.includes(c)).sort()
  const sortedCategories = [...ordered, ...remaining]

  return (
    <nav className="h-full overflow-y-auto py-4 px-3 pb-20">
      <div className="mb-4 px-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-az-40">
          Modules
        </h2>
      </div>
      {sortedCategories.map(cat => (
        <div key={cat} className="mb-4">
          <h3 className="px-2 mb-1 text-[11px] font-semibold uppercase tracking-wider text-az-50">
            {CATEGORY_LABELS[cat] || cat}
          </h3>
          {grouped[cat].map(mod => {
            const isActive = active === mod.package
            return (
              <button
                key={mod.package}
                onClick={() => { onSelect(mod.package); onClose?.() }}
                className={`w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors flex items-center cursor-pointer
                  ${isActive
                    ? 'bg-az-75 text-az-10 font-medium'
                    : 'text-az-30 hover:bg-az-80'
                  }`}
              >
                <StabilityDot stability={mod.stability} />
                {mod.name}
              </button>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
