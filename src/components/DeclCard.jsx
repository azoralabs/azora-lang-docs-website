import { useState } from 'react'
import CodeBlock from './CodeBlock'

const KIND_COLORS = {
  func: 'bg-pastel-orange',
  task: 'bg-pastel-purple',
  flow: 'bg-pastel-purple',
  pack: 'bg-pastel-teal',
  enum: 'bg-pastel-teal',
  form: 'bg-pastel-teal',
  spec: 'bg-pastel-red',
  prop: 'bg-pastel-blue',
  fin: 'bg-pastel-green',
  type: 'bg-pastel-pink',
  scope: 'bg-pastel-purple',
  impl: 'bg-pastel-red',
}

const KIND_LABELS = {
  func: 'func',
  task: 'task',
  flow: 'flow',
  pack: 'pack',
  enum: 'enum',
  form: 'form',
  spec: 'spec',
  prop: 'prop',
  fin: 'const',
  type: 'type',
  scope: 'scope',
  impl: 'impl',
}

function CollapseToggle({ open }) {
  return (
    <span className="ml-auto w-5 h-5 rounded-full border border-az-60 flex items-center justify-center shrink-0">
      <svg width="7" height="7" viewBox="0 0 10 10" className="text-az-40">
        {open
          ? <polygon points="1,7 5,2 9,7" fill="currentColor" />
          : <polygon points="1,3 5,8 9,3" fill="currentColor" />
        }
      </svg>
    </span>
  )
}

function CardHeader({ kind, name, open, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-3 bg-az-85 flex items-center gap-2 cursor-pointer"
    >
      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-black uppercase text-black ${KIND_COLORS[kind] || 'bg-az-50'}`}>
        {KIND_LABELS[kind] || kind}
      </span>
      <span className="font-mono font-semibold text-sm text-az-10">
        {name}
      </span>
      <CollapseToggle open={open} />
    </button>
  )
}

function CardBody({ doc }) {
  if (!doc) return null
  return (
    <>
      {doc.summary && (
        <p className="text-sm text-az-20">{doc.summary}</p>
      )}
      {doc.description && (
        <p className="text-sm text-az-30">{doc.description}</p>
      )}
      {doc.tags?.param?.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-az-40 mb-1">Parameters</h4>
          <table className="w-full text-sm">
            <tbody>
              {doc.tags.param.map((p, i) => (
                <tr key={i} className="border-t border-az-80">
                  <td className="py-1.5 pr-3 font-mono text-pastel-blue whitespace-nowrap">{p.name}</td>
                  <td className="py-1.5 text-az-30">{p.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {doc.tags?.return && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-az-40 mb-1">Returns</h4>
          <p className="text-sm text-az-30">{doc.tags.return}</p>
        </div>
      )}
      {doc.tags?.throws?.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-az-40 mb-1">Throws</h4>
          <ul className="text-sm text-az-30 list-disc list-inside">
            {doc.tags.throws.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}
      {doc.tags?.since && (
        <div className="pt-2 mt-2 border-t border-az-80 text-xs text-az-50">
          Since {doc.tags.since}
        </div>
      )}
    </>
  )
}

export default function DeclCard({ decl }) {
  const { kind, name, signature, doc, children } = decl
  const [open, setOpen] = useState(true)

  // Scope with children — render as a container with nested members
  if (kind === 'scope' && children?.length > 0) {
    return (
      <div id={name} className="rounded-lg border border-az-75 overflow-hidden">
        <CardHeader kind={kind} name={name} open={open} onClick={() => setOpen(o => !o)} />
        {open && (
          <div className="p-4 space-y-4">
            <CodeBlock>{signature}</CodeBlock>
            <CardBody doc={doc} />
            {/* Nested members */}
            <div className="space-y-3 pl-3 border-l-2 border-pastel-purple/30">
              {children.map((child, i) => (
                <DeclCard key={`${child.name}-${i}`} decl={child} />
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div id={name} className="rounded-lg border border-az-75 overflow-hidden">
      <CardHeader kind={kind} name={name} open={open} onClick={() => setOpen(o => !o)} />
      {open && (
        <div className="p-4 space-y-4">
          <CodeBlock>{signature}</CodeBlock>
          <CardBody doc={doc} />
        </div>
      )}
    </div>
  )
}
