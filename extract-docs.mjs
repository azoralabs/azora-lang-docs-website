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
const DOCS_VERSION = '0.0.4'
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
  const tags = { param: [], return: null, since: null, throws: [], file: null }

  let inDescription = false

  for (const line of lines) {
    if (isMetadataAnnotationLine(line)) continue

    const tagMatch = line.match(/^@(param|return|since|throws|file)\s+(.*)/)
    if (tagMatch) {
      const [, tag, rest] = tagMatch
      switch (tag) {
        case 'param': {
          const paramMatch = rest.match(/^(\w+)\s+(.*)/)
          if (paramMatch) {
            tags.param.push({ name: paramMatch[1], description: paramMatch[2] })
          } else {
            tags.param.push({ name: rest.trim(), description: '' })
          }
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

const DECL_PATTERN = /^\s*(?:@\w+(?:\([^)]*\))?\s+)*(?:(?:expose|protect|protected|friend|shield|opaque|bridge|inline|deepinline|threadlocal|unsafe|use)\s+)*(func|pack|task|flow|prop|spec|fin|type|zone|enum|form|impl|deco|fail|slot|infx|hook)\b(.+)?/

function isConfinedDeclarationLine(line) {
  return /^\s*(?:@\w+(?:\([^)]*\))?\s+)*confine\b/.test(line)
}

function parseDeclaration(line) {
  if (isConfinedDeclarationLine(line)) return null

  const m = line.match(DECL_PATTERN)
  if (!m) return null

  const kind = m[1]
  const rest = (m[2] || '').trim()

  let name = ''
  let signature = line.trim()

  switch (kind) {
    case 'func':
    case 'task':
    case 'flow':
    case 'infx':
    case 'hook': {
      const fnMatch = rest.match(/^(?:<[^>]+>\s+)?(\w+)/)
      if (fnMatch) name = fnMatch[1]
      signature = line.trim().replace(/\s*\{[\s\S]*$/, '').replace(/\s*=\s*[^{].*$/, (m) => m)
      break
    }
    case 'pack':
    case 'enum':
    case 'form':
    case 'deco':
    case 'fail':
    case 'slot': {
      const typeMatch = rest.match(/^(?:<[^>]+>\s+)?(\w+)/)
      if (typeMatch) name = typeMatch[1]
      signature = line.trim().replace(/\s*\{[\s\S]*$/, '')
      break
    }
    case 'spec': {
      const specMatch = rest.match(/^(\w+)/)
      if (specMatch) name = specMatch[1]
      signature = line.trim().replace(/\s*\{[\s\S]*$/, '')
      break
    }
    case 'prop': {
      const propMatch = rest.match(/^(\w+)/)
      if (propMatch) name = propMatch[1]
      signature = line.trim().replace(/\s*\{[\s\S]*$/, '').replace(/\s*=\s*.*$/, (m) => m)
      break
    }
    case 'fin': {
      const finMatch = rest.match(/^(\w+)/)
      if (finMatch) name = finMatch[1]
      signature = line.trim()
      break
    }
    case 'type': {
      const typeMatch = rest.match(/^(\w+)/)
      if (typeMatch) name = typeMatch[1]
      signature = line.trim().replace(/\s*\{[\s\S]*$/, '')
      break
    }
    case 'zone': {
      const zoneMatch = rest.match(/^(\w+)/)
      if (zoneMatch) name = zoneMatch[1]
      signature = line.trim().replace(/\s*\{[\s\S]*$/, '')
      break
    }
    case 'impl': {
      // impl Spec for Type — spec implementation (show it)
      // impl Type { ... } — method block (skip it)
      const implForMatch = rest.match(/^(\w+)\s+for\s+(\w+)/)
      if (implForMatch) {
        name = `${implForMatch[1]} for ${implForMatch[2]}`
        signature = line.trim().replace(/\s*\{[\s\S]*$/, '')
      } else {
        return null // skip impl blocks (method containers)
      }
      break
    }
  }

  return { kind, name, signature }
}

function declarationWithSignature(lines, index, declaration) {
  if (!declaration || !['func', 'task', 'flow', 'infx', 'hook'].includes(declaration.kind)) {
    return declaration
  }

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
    signatureLines.push(lines[cursor].trim())
    countParens(lines[cursor])
    cursor++
  }

  while (cursor < lines.length && /^\s*where\b/.test(lines[cursor])) {
    signatureLines.push(lines[cursor].trim())
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
  const moduleMatch = source.match(/^\s*(?:export\s+)?module\s+([\w.]+)/m)
  const packageName = moduleMatch ? moduleMatch[1] : ''

  // Extract stability annotation
  let stability = 'unknown'
  let since = null
  const stabMatch = source.match(/@file:(stable|experimental)(?:\(since:\s*"([^"]+)"\))?/)
  if (stabMatch) {
    stability = stabMatch[1]
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
  const zoneStack = [] // stack of { name, depth } for tracking which zone we're inside

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // Determine current parent zone (not counting 'std')
    const currentScope = zoneStack.length > 0 ? zoneStack[zoneStack.length - 1].name : null

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
          if (decl.kind === 'zone' && decl.name === 'std' && lines[i].includes('friend')) {
            braceDepth += countBraces(lines[i])
            i++
            continue
          }
          // Track zone entry
          if (decl.kind === 'zone') {
            const delta = countBraces(lines[i])
            braceDepth += delta
            if (delta > 0) zoneStack.push({ name: decl.name, depth: braceDepth })
            declarations.push({ ...decl, doc, metadata: annotated.metadata, children: [] })
          } else {
            declarations.push({ ...decl, doc, metadata: annotated.metadata, parentZone: currentScope })
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
          if (decl.kind === 'zone' && decl.name === 'std' && declLine.includes('friend')) {
            i++
            continue
          }
          if (decl.kind === 'zone') {
            if (braceDepth > depthBefore) zoneStack.push({ name: decl.name, depth: braceDepth })
            declarations.push({ ...decl, doc: null, metadata: annotated.metadata, children: [] })
          } else {
            declarations.push({ ...decl, doc: null, metadata: annotated.metadata, parentZone: currentScope })
          }
        }
      }

      i++
    } else {
      // Track brace depth
      const depthBefore = braceDepth
      braceDepth += countBraces(line)

      // Pop zone stack when we exit a scope block
      while (zoneStack.length > 0 && braceDepth < zoneStack[zoneStack.length - 1].depth) {
        zoneStack.pop()
      }

      // Check for undocumented declarations (only at valid depths, not inside function bodies)
      if (depthBefore <= 2) {
        const decl = declarationWithSignature(lines, i, parseDeclaration(line))
        if (decl && decl.name && !line.trim().startsWith('//')) {
          // Skip `friend zone std`
          if (decl.kind === 'zone' && decl.name === 'std' && line.includes('friend')) {
            i++
            continue
          }
          if (decl.kind === 'zone') {
            const delta = countBraces(line) - (braceDepth - depthBefore) // already counted
            if (braceDepth > depthBefore) zoneStack.push({ name: decl.name, depth: braceDepth })
            declarations.push({ ...decl, doc: null, children: [] })
          } else {
            declarations.push({ ...decl, doc: null, parentZone: currentScope })
          }
        }
      }
      i++
    }
  }

  // Nest children into their parent zones
  const zoneDecls = new Map()
  for (const decl of declarations) {
    if (decl.kind === 'zone') zoneDecls.set(decl.name, decl)
  }
  const topLevel = []
  for (const decl of declarations) {
    if (decl.parentZone && zoneDecls.has(decl.parentZone)) {
      zoneDecls.get(decl.parentZone).children.push(decl)
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
