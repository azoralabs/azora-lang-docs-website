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
const STD_ROOT = join(__dirname, '..')

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

const DECL_PATTERN = /^\s*(?:@\w+\s+)*(?:expose\s+)?(func|pack|task|flow|prop|spec|fin|type|scope|enum|form|impl)\b(.+)?/

function parseDeclaration(line) {
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
    case 'scope': {
      const scopeMatch = rest.match(/^(\w+)/)
      if (scopeMatch) name = scopeMatch[1]
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

  // Track brace depth and scope stack for nesting
  let braceDepth = 0
  const scopeStack = [] // stack of { name, depth } for tracking which scope we're inside

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // Determine current parent scope (not counting 'std')
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

      // Skip blank lines and decorator lines, look for the next declaration
      while (i < lines.length && (lines[i].trim() === '' || lines[i].trim().startsWith('@'))) i++

      if (i < lines.length) {
        const decl = parseDeclaration(lines[i])
        if (decl) {
          // Skip `expose scope std` — the top-level wrapper
          if (decl.kind === 'scope' && decl.name === 'std' && lines[i].includes('expose')) {
            braceDepth += countBraces(lines[i])
            i++
            continue
          }
          // Track scope entry
          if (decl.kind === 'scope') {
            const delta = countBraces(lines[i])
            braceDepth += delta
            if (delta > 0) scopeStack.push({ name: decl.name, depth: braceDepth })
            declarations.push({ ...decl, doc, children: [] })
          } else {
            declarations.push({ ...decl, doc, parentScope: currentScope })
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
    } else {
      // Track brace depth
      const depthBefore = braceDepth
      braceDepth += countBraces(line)

      // Pop scope stack when we exit a scope block
      while (scopeStack.length > 0 && braceDepth < scopeStack[scopeStack.length - 1].depth) {
        scopeStack.pop()
      }

      // Check for undocumented declarations (only at valid depths, not inside function bodies)
      if (depthBefore <= 2) {
        const decl = parseDeclaration(line)
        if (decl && decl.name && !line.trim().startsWith('//') && !line.trim().startsWith('confine')) {
          // Skip `expose scope std`
          if (decl.kind === 'scope' && decl.name === 'std' && line.includes('expose')) {
            i++
            continue
          }
          if (decl.kind === 'scope') {
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

  // Nest children into their parent scopes
  const scopeDecls = new Map()
  for (const decl of declarations) {
    if (decl.kind === 'scope') scopeDecls.set(decl.name, decl)
  }
  const topLevel = []
  for (const decl of declarations) {
    if (decl.parentScope && scopeDecls.has(decl.parentScope)) {
      scopeDecls.get(decl.parentScope).children.push(decl)
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

const output = { generated: new Date().toISOString(), modules }
const outPath = join(__dirname, 'docs-data.json')
writeFileSync(outPath, JSON.stringify(output, null, 2))

console.log(`Extracted ${modules.length} modules, ${modules.reduce((s, m) => s + m.declarations.length, 0)} declarations`)
console.log(`Written to ${outPath}`)
