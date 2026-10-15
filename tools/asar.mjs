// Read-only helpers for the Electron asar archive that carries the DSH runtime.
// Usage:
//   node tools/asar.mjs list <regex>            -> matching inner paths
//   node tools/asar.mjs read <inner/path>       -> file text on stdout
//   node tools/asar.mjs dump <regex> <outDir>   -> extract matching files under outDir
import fs from 'node:fs'
import path from 'node:path'

const ASAR = process.env.DSH_ASAR ?? 'D:/DSH-Desktop/resources/app.asar'
const [, , cmd, ...rest] = process.argv

const fd = fs.openSync(ASAR, 'r')
const head = Buffer.alloc(16)
fs.readSync(fd, head, 0, 16, 0)
const headerSize = head.readUInt32LE(12)
const headerBuf = Buffer.alloc(headerSize)
fs.readSync(fd, headerBuf, 0, headerSize, 16)
const header = JSON.parse(headerBuf.toString('utf8'))
const baseOffset = 16 + headerSize
// asar pads the header to a 4-byte boundary in some versions; align defensively.
const padCheck = headerSize % 4
if (padCheck !== 0) throw new Error(`unexpected unaligned header: ${headerSize}`)

/** Walk the asar tree into a flat map of inner path -> {offset, size} */
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

switch (cmd) {
  case 'list': {
    const re = new RegExp(rest[0], 'i')
    for (const k of entries.keys()) if (re.test(k)) console.log(k)
    break
  }
  case 'read': {
    process.stdout.write(readFile(rest[0]).toString('utf8'))
    break
  }
  case 'dump': {
    const re = new RegExp(rest[0], 'i')
    const outDir = rest[1]
    let n = 0
    for (const k of entries.keys()) {
      if (!re.test(k)) continue
      const dest = path.join(outDir, k.replace(/^\//, ''))
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.writeFileSync(dest, readFile(k))
      n++
    }
    console.log(`dumped ${n} files to ${outDir}`)
    break
  }
  case 'grep': {
    // grep <pathRe> <textRe> [contextChars]
    const pathRe = new RegExp(rest[0], 'i')
    const textRe = new RegExp(rest[1], 'g')
    const ctx = Number(rest[2] ?? 160)
    let hits = 0
    let full = false
    for (const [k, e] of entries) {
      if (full) break
      if (!pathRe.test(k) || e.unpacked || e.size > 4_000_000) continue
      const text = readFile(k).toString('utf8')
      for (const m of text.matchAll(textRe)) {
        const s = Math.max(0, m.index - ctx)
        console.log(`${k}:${text.slice(0, m.index).split('\n').length}: …${text.slice(s, m.index + m[0].length + ctx).replace(/\n/g, '\\n')}…`)
        if (++hits > 80) { console.log('… truncated'); full = true; break }
      }
    }
    if (!hits) console.log('(no matches)')
    break
  }
  default:
    console.error('usage: list <re> | read <path> | dump <re> <outDir> | grep <pathRe> <textRe> [ctx]')
    process.exitCode = 1
}
fs.closeSync(fd)
