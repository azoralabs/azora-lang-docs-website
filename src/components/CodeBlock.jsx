import { useState } from 'react'
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import { createAzoraLanguage } from '../data/azora-prism'

const semanticLanguages = new Map()
let semanticLanguageId = 0

function semanticAzoraLanguage(source) {
  const existing = semanticLanguages.get(source)
  if (existing) return existing
  const name = `azorasemantic${semanticLanguageId++}`
  SyntaxHighlighter.registerLanguage(name, createAzoraLanguage(source, name))
  semanticLanguages.set(source, name)
  return name
}

const theme = {
  'code[class*="language-"]': {
    color: '#D9D9D9',
    fontFamily: 'var(--font-code)',
    fontSize: '0.8125rem',
    lineHeight: '1.6',
  },
  'pre[class*="language-"]': {
    color: '#D9D9D9',
    background: '#141414',
    fontFamily: 'var(--font-code)',
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
  'spec-type': { color: '#5FA89F', fontStyle: 'italic' },
  zone: { color: '#D9DADA', fontStyle: 'italic' },
  'module-path': { color: '#D9DADA', fontStyle: 'italic' },
  generic: { color: '#5BA3D0', fontWeight: 'bold' },
  builtin: { color: '#E6C96B' },
  function: { color: '#E6C96B' },
  'spec-function': { color: '#E6C96B', fontStyle: 'italic' },
  'override-function': {
    color: '#E6C96B',
    fontStyle: 'italic',
    textDecorationLine: 'underline',
    textUnderlineOffset: '3px',
  },
  parameter: {
    color: '#D9DADA',
    textDecorationLine: 'underline',
    textUnderlineOffset: '3px',
  },
  property: {
    color: '#D9DADA',
    fontStyle: 'italic',
    textDecorationLine: 'underline',
    textUnderlineOffset: '3px',
  },
  'spec-property': { color: '#D9DADA', fontStyle: 'italic' },
  'override-property': {
    color: '#D9DADA',
    fontStyle: 'italic',
    textDecorationLine: 'underline',
    textUnderlineOffset: '3px',
  },
  unused: { color: '#B8B8B8' },
  'unused-parameter': {
    color: '#B8B8B8',
    textDecorationLine: 'underline',
    textUnderlineOffset: '3px',
  },
  'unused-property': {
    color: '#B8B8B8',
    fontStyle: 'italic',
    textDecorationLine: 'underline',
    textUnderlineOffset: '3px',
  },
  'unused-spec-function': { color: '#B8B8B8', fontStyle: 'italic' },
  'unused-spec-property': { color: '#B8B8B8', fontStyle: 'italic' },
  'unused-override-function': {
    color: '#B8B8B8',
    fontStyle: 'italic',
    textDecorationLine: 'underline',
    textUnderlineOffset: '3px',
  },
  'unused-override-property': {
    color: '#B8B8B8',
    fontStyle: 'italic',
    textDecorationLine: 'underline',
    textUnderlineOffset: '3px',
  },
  string: { color: '#7DBF8A' },
  number: { color: '#ECECEC' },
  'doc-comment': { color: '#6B9F77', fontStyle: 'italic' },
  'doc-tag': { color: '#5BA3D0', fontWeight: 'bold' },
  'doc-param-name': { color: '#D9D9D9' },
  comment: { color: '#676767', fontStyle: 'italic' },
  annotation: { color: 'var(--color-pastel-orange)' },
  variable: { color: '#D9DADA' },
  preprocessor: { color: '#B06FA8', fontStyle: 'italic' },
  macro: { color: '#B06FA8', fontWeight: 'bold' },
  interpolation: { color: '#E6C96B' },
  'interpolation-punctuation': { color: '#E6C96B' },
  operator: { color: '#B2B3B3' },
  punctuation: { color: '#B2B3B3' },
}

export default function CodeBlock({ children }) {
  const [copied, setCopied] = useState(false)
  const source = String(children ?? '')
  const language = semanticAzoraLanguage(source)

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
        language={language}
        style={theme}
        wrapLongLines
      >
        {children}
      </SyntaxHighlighter>
    </div>
  )
}
