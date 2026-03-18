import { useState } from 'react'
import DeclCard from './DeclCard'

const KIND_ORDER = ['scope', 'fin', 'type', 'spec', 'impl', 'pack', 'enum', 'form', 'prop', 'func', 'task', 'flow']
const SECTION_LABELS = {
  scope: 'Scopes',
  fin: 'Constants',
  type: 'Type Functions',
  spec: 'Specs',
  pack: 'Packs',
  enum: 'Enums',
  form: 'Forms',
  prop: 'Properties',
  func: 'Functions',
  impl: 'Implementations',
  task: 'Tasks',
  flow: 'Flows',
}

function StabilityBadge({ stability, since }) {
  if (stability === 'stable') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-pastel-green/20 text-pastel-green">
        Stable{since ? ` ${since}` : ''}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-pastel-yellow/20 text-pastel-yellow">
      Experimental
    </span>
  )
}

function CollapsibleSection({ label, count, children }) {
  const [open, setOpen] = useState(true)
  return (
    <section className="mb-8">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 pb-2 mb-4 border-b border-az-75 cursor-pointer group"
      >
        <h2 className="text-lg font-semibold text-az-20 group-hover:text-az-10 transition-colors">
          {label}
        </h2>
        <span className="text-xs text-az-50 font-mono">{count}</span>
        <span className="ml-auto w-6 h-6 rounded-full border border-az-60 flex items-center justify-center">
          <svg width="8" height="8" viewBox="0 0 10 10" className="text-az-40">
            {open
              ? <polygon points="1,7 5,2 9,7" fill="currentColor" />
              : <polygon points="1,3 5,8 9,3" fill="currentColor" />
            }
          </svg>
        </span>
      </button>
      {open && children}
    </section>
  )
}

export default function DocPage({ module: mod }) {
  if (!mod) {
    return (
      <div className="flex items-center justify-center h-full text-az-50">
        <p>Select a module from the sidebar.</p>
      </div>
    )
  }

  // Group declarations by kind
  const grouped = {}
  for (const decl of mod.declarations) {
    if (!grouped[decl.kind]) grouped[decl.kind] = []
    grouped[decl.kind].push(decl)
  }

  const sections = KIND_ORDER.filter(k => grouped[k])

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6">
      {/* Module header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold text-az-10">
            {mod.name}
          </h1>
          <StabilityBadge stability={mod.stability} since={mod.since || mod.fileDoc?.tags?.since} />
        </div>
        <p className="text-sm font-mono text-az-40 mb-1">
          {mod.package}
        </p>
        <p className="text-xs font-mono text-az-50 mb-3">
          All members are inside <span className="text-pastel-purple">expose scope std</span>
        </p>
        {mod.fileDoc && (
          <>
            {mod.fileDoc.summary && (
              <p className="text-base text-az-20 mb-1">
                {mod.fileDoc.summary}
              </p>
            )}
            {mod.fileDoc.description && (
              <p className="text-sm text-az-30">
                {mod.fileDoc.description}
              </p>
            )}
            {(mod.since || mod.fileDoc.tags?.since) && (
              <p className="text-xs text-az-50 mt-2">
                Since {mod.since || mod.fileDoc.tags.since}
              </p>
            )}
          </>
        )}
      </div>

      {/* Declaration sections */}
      {sections.map(kind => (
        <CollapsibleSection key={kind} label={SECTION_LABELS[kind] || kind} count={grouped[kind].length}>
          <div className="space-y-4">
            {grouped[kind].map((decl, i) => (
              <DeclCard key={`${decl.name}-${i}`} decl={decl} />
            ))}
          </div>
        </CollapsibleSection>
      ))}

      {mod.declarations.length === 0 && (
        <p className="text-az-50 italic">
          No documented declarations found.
        </p>
      )}
    </div>
  )
}
