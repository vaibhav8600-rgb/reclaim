// Writes the realistic demo dataset as a Reclaim backup file.
// Import it in Settings → Restore to explore the app with ~75 days of sample data.
import { writeFileSync } from 'node:fs'
import { generateDemoData } from '../e2e/fixtures/demo-data.ts'

const out = process.argv[2] ?? 'Reclaim-demo.json'
writeFileSync(out, JSON.stringify(generateDemoData(), null, 2))
console.log(`Wrote ${out} — import it in Settings → Restore.`)
