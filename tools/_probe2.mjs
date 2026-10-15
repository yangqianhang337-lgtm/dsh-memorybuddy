import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ASAR = process.env.DSH_ASAR ?? 'D:/DSH-Desktop/resources/app.asar'
const fd = fs.openSync(ASAR, 'r')
const head = Buffer.alloc(16)
fs.readSync(fd, head, 0, 16, 0)
const headerSize = head.readUInt32LE(12)
const headerBuf = Buffer.alloc(headerSize)
fs.readSync(fd, headerBuf, 0, headerSize, 16)
const header = JSON.parse(headerBuf.toString('utf8'))
const baseOffset = 16 + headerSize
function walk(node, prefix, out) {
  for (const [name, child] of Object.entries(node.files ?? {})) {
    const p = `${prefix}/${name}`
    if (child.files) walk(child, p, out)
    else if (child.unpacked) out.set(p, { unpacked: true })
    else out.set(p, { offset: Number(child.offset), size: child.size })
  }
  return out
}
const entries = walk(header, '', new Map())
function readFile(inner) {
  const e = entries.get(inner)
  if (!e) throw new Error(`not found: ${inner}`)
  if (e.unpacked) return fs.readFileSync(path.join(`${ASAR}.unpacked`, inner))
  const buf = Buffer.alloc(e.size)
  fs.readSync(fd, buf, 0, e.size, baseOffset + e.offset)
  return buf
}

const target = process.argv[2]
const kws = process.argv.slice(3)
const s = readFile(target).toString('utf8')
console.log(`## ${target} (${s.length} chars)`)
for (const kw of kws) {
  let idx = -1, n = 0
  while ((idx = s.indexOf(kw, idx + 1)) !== -1 && n < 4) {
    console.log(`=== ${kw} @ ${idx}`)
    console.log(s.slice(Math.max(0, idx - 400), idx + 1200))
    n++
  }
}
