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
// The standard library lives in the sibling `azora-lang` repo under Internal/Std.
// (Previously this pointed at the parent dir, which would also sweep in the old compiler,
// integration tests, and example apps — narrowing it keeps the API reference authoritative.)
const STD_ROOT = join(__dirname, '..', 'azora-lang', 'Internal', 'Std')

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
  return /^@sice(?:\b|\s|\(|$)/.test(text)
    || /^@since\s*\(/.test(text)
    || /^@deprecated(?:\b|\s|\(|$)/.test(text)
    || /^@(experimental|stable)(?:\b|\s|\(|$)/.test(text)
}

function parseMetadataAnnotation(line) {
  const text = line.trim()

  let m = text.match(/^@(since|sice)\s*(?:\(\s*"([^"]+)"\s*\)|\s+(.+))?/)
  if (m) {
    return { since: (m[2] || m[3] || '').trim().replace(/^"|"$/g, '') || null }
  }

  m = text.match(/^@(experimental|stable)(?:\(\s*since\s*:\s*"([^"]+)"\s*\))?/)
  if (m) {
    return { stability: m[1], since: m[2] || null }
  }

  m = text.match(/^@deprecated(?:\((.*)\))?/)
  if (m) {
    const args = m[1] || ''
    const since = args.match(/since\s*:\s*"([^"]+)"/)?.[1] || null
    const message = args.match(/(?:message|reason)\s*:\s*"([^"]+)"/)?.[1] || null
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
    const parsed = parseMetadataAnnotation(trimmed)
    if (!parsed) break
    metadata = mergeMetadata(metadata, parsed)
    i++
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

const DECL_PATTERN = /^\s*(?:@\w+\s+)*(?:(?:expose|confine|protect)\s+)?(?:friend\s+)?(?:shield\s+)?(func|pack|task|flow|prop|spec|fin|type|zone|enum|form|impl)\b(.+)?/

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
    case 'flow': {
      const fnMatch = rest.match(/^(?:<[^>]+>\s+)?(\w+)/)
      if (fnMatch) name = fnMatch[1]
      signature = line.trim().replace(/\s*\{[\s\S]*$/, '').replace(/\s*=\s*[^{].*$/, (m) => m)
      break
    }
    case 'pack':
    case 'enum':
    case 'form': {
      const typeMatch = rest.match(/^(\w+)/)
      if (typeMatch) name = typeMatch[1]
      signature = line.trim().replace(/\s*\{[\s\S]*$/, '')
      break
    }
    case 'spec': {
      const specMatch = rest.match(/^(\w+)/)
      if (specMatch) name = specMatch[1]
      signature = line.trim()
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
        signature = line.trim()
      } else {
        return null // skip impl blocks (method containers)
      }
      break
    }
  }

  return { kind, name, signature }
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

  // Extract package
  const pkgMatch = source.match(/^package\s+([\w.]+)/m)
  const packageName = pkgMatch ? pkgMatch[1] : ''

  // Extract stability annotation
  let stability = 'unknown'
  let since = null
  const stabMatch = source.match(/@file:(stable|experimental)(?:\(since:\s*"([^"]+)"\))?/)
  if (stabMatch) {
    stability = stabMatch[1]
    since = stabMatch[2] || null
  }

  // Use file name as module name (e.g. List.az → List, IO.az → IO)
  const moduleName = basename(filePath, '.az')

  // Category from directory
  const relPath = relative(STD_ROOT, filePath)
  const category = dirname(relPath).toLowerCase()

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
        const decl = parseDeclaration(lines[i])
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
    } else if (parseMetadataAnnotation(line)) {
      const annotated = collectMetadataAnnotations(lines, i)
      i = annotated.index
      if (i >= lines.length) break

      const declLine = lines[i]
      const depthBefore = braceDepth
      braceDepth += countBraces(declLine)

      if (depthBefore <= 2) {
        const decl = parseDeclaration(declLine)
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
        const decl = parseDeclaration(line)
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

  return {
    name: moduleName,
    package: moduleId,
    file: relPath,
    category,
    stability,
    since,
    fileDoc,
    declarations: topLevel,
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

const output = { generated: new Date().toISOString(), version: '0.0.3', modules }
const outPath = join(__dirname, 'docs-data.json')
writeFileSync(outPath, JSON.stringify(output, null, 2))

console.log(`Extracted ${modules.length} modules, ${modules.reduce((s, m) => s + m.declarations.length, 0)} declarations`)
console.log(`Written to ${outPath}`)
