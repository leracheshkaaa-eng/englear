// Prints the SQL that imports a dictionary package (dry run unless --real).
// Usage: node scripts/dictionary/to-sql.mjs <package.json> [--real] > out.sql
// Run the output in the Supabase SQL editor (or any session with admin/service rights).
import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/dictionary/to-sql.mjs <package.json> [--real]')
  process.exit(1)
}
const real = process.argv.includes('--real')
const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'seed', 'dictionary', basename(file)), 'utf8'))
const payload = JSON.stringify(pkg.words)
if (payload.includes('$pkg$')) throw new Error('package contains the SQL quote marker')
console.log(`-- ${pkg.package} (${pkg.words.length} words) — ${real ? 'REAL IMPORT' : 'dry run'}`)
console.log(`select public.import_dictionary_words($pkg$${payload}$pkg$::jsonb, ${real ? 'false' : 'true'});`)
