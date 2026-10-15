import fs from 'node:fs'
const s = fs.readFileSync('.refs/sysprompt.js', 'utf16le')
const kws = ['section(', 'systemPrompt', 'interpolate']
for (const kw of kws) {
  let idx = -1, n = 0
  while ((idx = s.indexOf(kw, idx + 1)) !== -1 && n < 5) {
    console.log('=== ' + kw + ' @ ' + idx)
    console.log(s.slice(Math.max(0, idx - 300), idx + 900))
    n++
  }
}
