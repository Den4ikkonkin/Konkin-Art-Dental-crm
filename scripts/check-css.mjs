#!/usr/bin/env node
/**
 * Проверка mobile.css на правила, которые не могут сработать.
 * Классы из *.module.css Next.js переименовывает при сборке
 * (.card → TeamPanel-module__x7F__card), поэтому глобальное
 * правило .card { … } не применится никогда.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const TARGET = 'src/app/mobile.css'
const GLOBAL_CSS = [
  'src/app/globals.css',
  'src/app/fixes.css',
  'src/app/theme-glass.css',
  'src/components/premium.css',
  'src/components/oc-card.css',
]

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const classesInFile = (path) => {
  const txt = stripComments(readFileSync(path, 'utf8'))
  return new Set([...txt.matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)].map((m) => m[1]))
}

function usedInMarkup() {
  const used = new Set()
  const add = (str) => {
    for (const t of String(str).split(/\s+/)) if (/^[a-zA-Z][\w-]*$/.test(t)) used.add(t)
  }
  for (const f of walk('src')) {
    if (!f.endsWith('.tsx') && !f.endsWith('.ts')) continue
    const txt = readFileSync(f, 'utf8')
    for (const m of txt.matchAll(/className=(?:"(\{[^"]*)"|"([^"]*)"|\{([\s\S]{0,500}?)\})/g)) {
      if (m[2] !== undefined) { add(m[2]); continue }
      for (const s of (m[3] ?? m[1] ?? '').matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`/g)) {
        add(s[1] ?? s[2] ?? s[3] ?? '')
      }
    }
  }
  return used
}

const moduleClasses = new Set()
for (const f of walk('src')) if (f.endsWith('.module.css')) classesInFile(f).forEach((c) => moduleClasses.add(c))

const globalClasses = new Set()
for (const f of GLOBAL_CSS) { try { classesInFile(f).forEach((c) => globalClasses.add(c)) } catch {} }

const targetTxt = stripComments(readFileSync(TARGET, 'utf8'))
const targetClasses = classesInFile(TARGET)
const markup = usedInMarkup()

const errors = []
const warnings = []

for (const cls of targetClasses) {
  if (moduleClasses.has(cls) && !globalClasses.has(cls)) {
    errors.push(`«.${cls}» — класс CSS-модуля, правило в ${TARGET} не сработает. Перенесите в *.module.css.`)
    continue
  }
  if (!globalClasses.has(cls) && !markup.has(cls)) {
    warnings.push(`«.${cls}» не найден ни в глобальных CSS, ни в разметке — опечатка?`)
  }
}

console.log(`Проверено классов в ${TARGET}: ${targetClasses.size}`)
console.log(`Модульных классов: ${moduleClasses.size}, классов в разметке: ${markup.size}`)
if (warnings.length) { console.log(`\nПредупреждения (${warnings.length}):`); for (const w of warnings) console.log(`  ⚠ ${w}`) }
if (errors.length) { console.log(`\nОШИБКИ (${errors.length}):`); for (const e of errors) console.log(`  ✗ ${e}`); process.exit(1) }
console.log('\n✓ Мёртвых правил на модульные классы нет.')
