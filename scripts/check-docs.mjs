import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const { version, modules } = JSON.parse(await readFile(new URL('../docs-data.json', import.meta.url)))
const declarations = modules.flatMap(m => m.declarations.flatMap(d => [d, ...(d.children || [])]))
assert.equal(version, '0.1.0-dev')
assert.ok(modules.every(m => m.package.startsWith('std.')))
assert.equal(new Set(modules.map(m => m.package)).size, modules.length)
assert.ok(declarations.every(d => d.name && !d.name.startsWith('_')))
for (const name of ['get', 'set', 'dequeue', 'State', 'Option', 'Serializer', 'StringError']) {
  assert.ok(declarations.some(d => d.name === name), `Missing ${name}`)
}
assert.ok(declarations.some(d => d.kind === 'oper'))
assert.ok(declarations.some(d => d.signature.startsWith('func !.dequeue')))
assert.ok(!modules.some(m => ['std.result', 'std.macro', 'std.memory.arc'].includes(m.package)))
assert.ok(!declarations.some(d => d.name === 'skipWhitespace'), 'Private reader methods must stay private')
console.log(`${modules.length} current modules and ${declarations.length} public declarations verified`)
