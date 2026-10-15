// Print the staticModules (platform seed) table from the DSH web frontend bundle.
import { readFileSync } from 'node:fs'

const file = process.argv[2]
const src = readFileSync(file, 'utf8')
const idx = src.indexOf('staticModules')
console.log('staticModules idx:', idx)
if (idx < 0) process.exit(0)
console.log(src.slice(Math.max(0, idx - 3000), idx + 400))
