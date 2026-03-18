import { useState } from 'react'
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import azora from '../data/azora-prism'

SyntaxHighlighter.registerLanguage('azora', azora)

const theme = {
  'code[class*="language-"]': {
    color: '#D9D9D9',
    fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
    fontSize: '0.8125rem',
    lineHeight: '1.6',
  },
  'pre[class*="language-"]': {
    color: '#D9D9D9',
    background: '#141414',
    fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
    fontSize: '0.8125rem',
    lineHeight: '1.6',
    padding: '1rem',
    margin: '0',
    overflow: 'auto',
    borderRadius: '0.5rem',
  },
  keyword: { color: '#D16B8E', fontWeight: 'bold' },
  boolean: { color: '#D16B8E', fontWeight: 'bold' },
  'class-name': { color: '#5FA89F' },
  builtin: { color: '#D4A574' },
  function: { color: '#D4A574' },
  string: { color: '#7DBF8A' },
  number: { color: '#ECECEC' },
  'doc-comment': { color: '#6B9F77', fontStyle: 'italic' },
  'doc-tag': { color: '#5BA3D0', fontWeight: 'bold' },
  'doc-param-name': { color: '#D9D9D9' },
  comment: { color: '#676767', fontStyle: 'italic' },
  annotation: { color: '#E6C96B' },
  variable: { color: '#B06FA8', fontStyle: 'italic' },
  interpolation: { color: '#E6C96B' },
  'interpolation-punctuation': { color: '#E6C96B' },
  operator: { color: '#B2B3B3' },
  punctuation: { color: '#B2B3B3' },
}

export default function CodeBlock({ children }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative rounded-lg border border-az-75 overflow-hidden">
      <button
        onClick={copy}
        className="absolute top-2 right-2 opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity
          px-2 py-0.5 rounded text-xs bg-az-75 text-az-40 cursor-pointer"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <SyntaxHighlighter
        language="azora"
        style={theme}
        wrapLongLines
      >
        {children}
      </SyntaxHighlighter>
    </div>
  )
}
