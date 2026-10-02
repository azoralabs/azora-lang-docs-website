#!/usr/bin/env node

/**
 * Azora Standard Library Documentation Extractor
 *
 * Parses .az source files and extracts doc comments + declarations
 * into a structured JSON file for the documentation site.
 *
 * No external dependencies required.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, relative, basename, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DOCS_VERSION = '0.1-dev'
const STD_ROOT = join(__dirname, '..', 'azora-lang', 'std')

// --- File Discovery ---

function findAzFiles(dir) {
  const results = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory() && entry !== 'docs' && entry !== 'node_modules') {
      results.push(...findAzFiles(full))
    } else if (entry.endsWith('.az')) {
      results.push(full)
    }
  }
  return results
}

// --- Doc Comment Parsing ---

function isMetadataAnnotationLine(line) {
  const text = line.trim()
  return /^@(?:SinceAzora|Since|Sice)(?:\b|\s|\(|$)/i.test(text)
    || /^@Deprecated(?:\b|\s|\(|$)/i.test(text)
    || /^@(Experimental|Stable)(?:\b|\s|\(|$)/i.test(text)
}

function parseMetadataAnnotation(line) {
  const text = line.trim()

  let m = text.match(/^@(SinceAzora|Since|Sice)\s*(?:\(\s*"([^"]+)"\s*\)|\s+(.+))?/i)
  if (m) {
    return { since: (m[2] || m[3] || '').trim().replace(/^"|"$/g, '') || null }
  }

  m = text.match(/^@(Experimental|Stable)(?:\(\s*(?:sinceAzora|since)\s*:\s*"([^"]+)"\s*\))?/i)
  if (m) {
    return { stability: m[1].toLowerCase(), since: m[2] || null }
  }

  m = text.match(/^@Deprecated(?:\((.*)\))?/i)
  if (m) {
    const args = m[1] || ''
    const since = args.match(/(?:sinceAzora|since)\s*:\s*"([^"]+)"/i)?.[1] || null
    const message = args.match(/(?:replacement|message|reason)\s*:\s*"([^"]+)"/i)?.[1] || null
    return { stability: 'deprecated', deprecated: true, since, message }
  }

  return null
}

function mergeMetadata(current, next) {
  if (!next) return current
  return {
    ...(current || {}),
    ...next,
    since: next.since || current?.since || null,
  }
}

function collectMetadataAnnotations(lines, start) {
  let metadata = null
  let i = start
  while (i < lines.length) {
    const trimmed = lines[i].trim()
    if (trimmed === '') {
      i++
      continue
    }
    if (!/^@[A-Za-z_]\w*/.test(trimmed)) break

    metadata = mergeMetadata(metadata, parseMetadataAnnotation(trimmed))

    let parenDepth = 0
    let inString = false
    do {
      const annotationLine = lines[i]
      for (let offset = 0; offset < annotationLine.length; offset++) {
        const char = annotationLine[offset]
        if (char === '"' && annotationLine[offset - 1] !== '\\') {
          inString = !inString
        } else if (!inString && char === '(') {
          parenDepth++
        } else if (!inString && char === ')') {
          parenDepth--
        }
      }
      i++
    } while (i < lines.length && parenDepth > 0)
  }
  return { index: i, metadata }
}

function parseDocComment(raw) {
  // Strip /** and */ and leading * on each line
  const lines = raw
    .replace(/^\s*\/\*\*\s*/, '')
    .replace(/\s*\*\/\s*$/, '')
    .split('\n')
    .map(l => l.replace(/^\s*\*\s?/, ''))

  let summary = ''
  let description = ''
  const tags = { param: [], generic: [], return: null, since: null, throws: [], file: null }

  let inDescription = false

  for (const line of lines) {
    if (isMetadataAnnotationLine(line)) continue

    const tagMatch = line.match(/^@(param|generic|return|since|throws|file)\s+(.*)/)
    if (tagMatch) {
      const [, tag, rest] = tagMatch
      switch (tag) {
        // `@param` documents a value parameter, `@generic` a type parameter.
        // They render as separate sections, so they are collected separately.
        case 'param':
        case 'generic': {
          const entryMatch = rest.match(/^(\w+)\s+(.*)/)
          const entry = entryMatch
            ? { name: entryMatch[1], description: entryMatch[2] }
            : { name: rest.trim(), description: '' }
          tags[tag].push(entry)
          break
        }
        case 'return':
          tags.return = rest.trim()
          break
        case 'since':
          tags.since = rest.trim()
          break
        case 'throws':
          tags.throws.push(rest.trim())
          break
        case 'file':
          tags.file = rest.trim()
          break
      }
    } else if (!summary && line.trim()) {
      summary = line.trim()
      inDescription = false
    } else if (summary && !inDescription && line.trim() === '') {
      inDescription = true
    } else if (inDescription && line.trim()) {
      description += (description ? ' ' : '') + line.trim()
    }
  }

  return { summary, description, tags }
}

// --- Declaration Parsing ---

const DECL_PATTERN = /^\s*(?:@\w+(?:\([^)]*\))?\s+)*(?:(?:exposed|confined|protected|bridge|inline|deepinline|threadlocal|unsafe|async|react|solo|node|leaf|variant|scoped)\s+)*(func|pack|prop|spec|fin|val|var|let|typealias|scope|enum|impl|annot|error|union|oper|ctor|dtor|macro)\b(.*)/

function parseDeclaration(line) {
  const match = line.match(DECL_PATTERN)
  if (!match) return null
  const kind = match[1]
  const rest = match[2].trim()
  let name = ''
  // Skip generic parameters and shorthand receivers before a callable's name.
  if (['func', 'prop'].includes(kind)) {
    name = rest.match(/^(?:<[^>]+>\s*)?(?:[&!]\s*\.\s*)?([A-Za-z_]\w*)/)?.[1] || ''
    // Explicit typed receivers, such as `func Type&.member`.
    const typed = rest.match(/^(?:<[^>]+>\s*)?[A-Za-z_]\w*(?:<[^>]+>)?[&!]\.([A-Za-z_]\w*)/)
    if (typed) name = typed[1]
  } else if (kind === 'oper') {
    name = `oper${rest.match(/^(\S+)/)?.[1] || ''}`
  } else if (kind === 'impl') {
    name = rest.replace(/\s*\{.*$/, '').trim()
  } else if (['ctor', 'dtor'].includes(kind)) {
    name = kind
  } else if (kind === 'macro') {
    name = rest.match(/@([A-Za-z_]\w*[!?&*^]?)/)?.[1] || ''
  } else {
    name = rest.match(/^@?([A-Za-z_]\w*)/)?.[1] || ''
  }
  if (!name || name.startsWith('_')) return null
  const signature = line.trim().replace(/\s*\{[\s\S]*$/, '')
  return { kind, name, signature }
}

function declarationWithSignature(lines, index, declaration) {
  if (!declaration || !['func', 'oper', 'ctor'].includes(declaration.kind)) {
    return declaration
  }

  // Continuation lines keep their indentation, dedented by whatever the
  // declaration itself is indented by. Trimming every line collapsed
  // multi-line parameter lists flush against the left margin.
  const baseIndent = lines[index].match(/^[ \t]*/)[0]
  const dedent = (line) => (
    line.startsWith(baseIndent) ? line.slice(baseIndent.length) : line.replace(/^[ \t]+/, '')
  ).replace(/\s+$/, '')

  const signatureLines = [lines[index].trim()]
  let parenDepth = 0
  let inString = false

  const countParens = (line) => {
    for (let offset = 0; offset < line.length; offset++) {
      const char = line[offset]
      if (char === '"' && line[offset - 1] !== '\\') {
        inString = !inString
      } else if (!inString && char === '(') {
        parenDepth++
      } else if (!inString && char === ')') {
        parenDepth--
      }
    }
  }

  countParens(lines[index])
  let cursor = index + 1
  while (cursor < lines.length && parenDepth > 0) {
    signatureLines.push(dedent(lines[cursor]))
    countParens(lines[cursor])
    cursor++
  }

  while (cursor < lines.length && /^\s*where\b/.test(lines[cursor])) {
    signatureLines.push(dedent(lines[cursor]))
    if (lines[cursor].includes('{')) break
    cursor++
  }

  const signature = signatureLines
    .join('\n')
    .replace(/\s*\{[\s\S]*$/, '')
    .trim()

  return { ...declaration, signature }
}

// --- Brace Depth Tracking ---

function countBraces(line) {
  let delta = 0
  let inStr = false
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"' && (i === 0 || line[i - 1] !== '\\')) {
      inStr = !inStr
    }
    if (!inStr) {
      if (line[i] === '{') delta++
      else if (line[i] === '}') delta--
    }
  }
  return delta
}

// --- Main Extraction ---

function extractModule(filePath) {
  const source = readFileSync(filePath, 'utf-8')
  const lines = source.split('\n')

  // `export module` has the same documented module identity as `module`.
  const moduleMatch = source.match(/^\s*(?:(?:exposed|confined)\s+)*module\s+([\w.]+)/m)
  const packageName = moduleMatch ? moduleMatch[1] : ''

  // Extract stability annotation
  let stability = 'unknown'
  let since = null
  const stabMatch = source.match(/@file:(Stable|Experimental)(?:\((?:sinceAzora|since):\s*"([^"]+)"\))?/i)
  if (stabMatch) {
    stability = stabMatch[1].toLowerCase()
    since = stabMatch[2] || null
  }

  // Use file name as module name (e.g. List.az → List, IO.az → IO)
  const fileName = basename(filePath, '.az')
  const moduleName = fileName.charAt(0).toUpperCase() + fileName.slice(1)

  // Category from directory
  const relPath = relative(STD_ROOT, filePath)
  const categoryDir = dirname(relPath).toLowerCase()
  const category = categoryDir === '.' ? 'language' : categoryDir.split('/')[0]

  // Use actual package name as the module identifier
  const moduleId = packageName

  // Parse doc blocks and associate with declarations
  let fileDoc = null
  const declarations = []

  // Track brace depth and zone stack for nesting
  let braceDepth = 0
  const scopeStack = [] // stack of { name, depth } for tracking which zone we're inside

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // Private containers must not leak their otherwise public method names.
    if (/^\s*(?:(?:bridge|inline|deepinline|async|react|variant|unsafe|solo|node|leaf)\s+)*(?:pack|impl|scope|func|prop)\s*(?:<[^>]+>\s*)?_[A-Za-z]\w*/.test(line)) {
      let privateDepth = countBraces(line)
      i++
      while (i < lines.length && privateDepth > 0) {
        privateDepth += countBraces(lines[i++])
      }
      continue
    }

    // Determine current parent zone (not counting 'std')
    const currentScope = scopeStack.length > 0 ? scopeStack[scopeStack.length - 1].name : null

    // Check for doc comment start
    if (line.trim().startsWith('/**')) {
      // Collect the entire doc comment
      let docRaw = ''
      if (line.trim().endsWith('*/')) {
        docRaw = line.trim()
        i++
      } else {
        while (i < lines.length) {
          docRaw += lines[i] + '\n'
          if (lines[i].includes('*/')) {
            i++
            break
          }
          i++
        }
      }

      const doc = parseDocComment(docRaw)

      // Check if this is a @file doc
      if (doc.tags.file) {
        fileDoc = doc
        continue
      }

      // Skip blank lines and collect declaration annotations before the next declaration.
      const annotated = collectMetadataAnnotations(lines, i)
      i = annotated.index

      if (i < lines.length) {
        const decl = declarationWithSignature(lines, i, parseDeclaration(lines[i]))
        if (decl) {
          // Skip `friend zone std` — the top-level wrapper
          if (['scope', 'impl'].includes(decl.kind) && decl.name === 'std' && lines[i].includes('friend')) {
            braceDepth += countBraces(lines[i])
            i++
            continue
          }
          // Track zone entry
          if (['scope', 'impl'].includes(decl.kind)) {
            const delta = countBraces(lines[i])
            braceDepth += delta
            if (delta > 0) scopeStack.push({ name: decl.name, depth: braceDepth })
            declarations.push({ ...decl, doc, metadata: annotated.metadata, children: [] })
          } else {
            declarations.push({ ...decl, doc, metadata: annotated.metadata, parentScope: currentScope })
            braceDepth += countBraces(lines[i])
          }
          i++
          continue
        }
      }

      // No declaration follows — store as file-level doc
      if (!fileDoc) {
        fileDoc = doc
      }
    } else if (/^\s*@[A-Za-z_]\w*/.test(line)) {
      const annotated = collectMetadataAnnotations(lines, i)
      i = annotated.index
      if (i >= lines.length) break

      const declLine = lines[i]
      const depthBefore = braceDepth
      braceDepth += countBraces(declLine)

      if (depthBefore <= 2) {
        const decl = declarationWithSignature(lines, i, parseDeclaration(declLine))
        if (decl && decl.name && !declLine.trim().startsWith('//')) {
          // Skip `friend zone std`
          if (['scope', 'impl'].includes(decl.kind) && decl.name === 'std' && declLine.includes('friend')) {
            i++
            continue
          }
          if (['scope', 'impl'].includes(decl.kind)) {
            if (braceDepth > depthBefore) scopeStack.push({ name: decl.name, depth: braceDepth })
            declarations.push({ ...decl, doc: null, metadata: annotated.metadata, children: [] })
          } else {
            declarations.push({ ...decl, doc: null, metadata: annotated.metadata, parentScope: currentScope })
          }
        }
      }

      i++
    } else {
      // Track brace depth
      const depthBefore = braceDepth
      braceDepth += countBraces(line)

      // Pop zone stack when we exit a scope block
      while (scopeStack.length > 0 && braceDepth < scopeStack[scopeStack.length - 1].depth) {
        scopeStack.pop()
      }

      // Check for undocumented declarations (only at valid depths, not inside function bodies)
      if (depthBefore <= 2) {
        const decl = declarationWithSignature(lines, i, parseDeclaration(line))
        if (decl && decl.name && !line.trim().startsWith('//')) {
          // Skip `friend zone std`
          if (['scope', 'impl'].includes(decl.kind) && decl.name === 'std' && line.includes('friend')) {
            i++
            continue
          }
          if (['scope', 'impl'].includes(decl.kind)) {
            const delta = countBraces(line) - (braceDepth - depthBefore) // already counted
            if (braceDepth > depthBefore) scopeStack.push({ name: decl.name, depth: braceDepth })
            declarations.push({ ...decl, doc: null, children: [] })
          } else {
            declarations.push({ ...decl, doc: null, parentScope: currentScope })
          }
        }
      }
      i++
    }
  }

  // Nest children into their parent zones
  const scopeDecls = new Map()
  for (const decl of declarations) {
    if (['scope', 'impl'].includes(decl.kind)) scopeDecls.set(decl.name, decl)
  }
  const topLevel = []
  for (const decl of declarations) {
    if (decl.parentScope && scopeDecls.has(decl.parentScope)) {
      scopeDecls.get(decl.parentScope).children.push(decl)
    } else {
      topLevel.push(decl)
    }
  }

  const documented = topLevel
    .map((decl) => ({
      ...decl,
      ...(decl.children
        ? { children: decl.children.filter((child) => child.doc || child.metadata) }
        : {}),
    }))
    .filter((decl) => decl.doc || decl.metadata || decl.children?.length > 0)

  return {
    name: moduleName,
    package: moduleId,
    file: relPath,
    category,
    stability,
    since,
    fileDoc,
    declarations: documented,
  }
}

// --- Run ---

const files = findAzFiles(STD_ROOT)
const modules = files.map(f => extractModule(f)).sort((a, b) => a.name.localeCompare(b.name))

// Disambiguate modules that share the same package name
const seen = {}
for (const mod of modules) {
  if (seen[mod.package]) {
    // Collision: rename both the previous and this one
    const prev = seen[mod.package]
    if (!prev.renamed) {
      prev.package = prev.package + '.' + prev.name.toLowerCase()
      prev.renamed = true
    }
    mod.package = mod.package + '.' + mod.name.toLowerCase()
    mod.renamed = true
  } else {
    seen[mod.package] = mod
  }
}
// Clean up temp flag
for (const mod of modules) delete mod.renamed

const output = { generated: new Date().toISOString(), version: DOCS_VERSION, modules }
const outPath = join(__dirname, 'docs-data.json')
writeFileSync(outPath, JSON.stringify(output, null, 2))

console.log(`Extracted ${modules.length} modules, ${modules.reduce((s, m) => s + m.declarations.length, 0)} declarations`)
console.log(`Written to ${outPath}`)
