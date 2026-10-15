// Read the app.asar header and locate a package directory inside it.
import { open } from 'node:fs/promises'

const ASAR = 'D:\\DSH-Desktop\\resources\\app.asar'
const needle = process.argv[2] ?? 'dsh-client-ui-primitives'

const fh = await open(ASAR, 'r')
const head = Buffer.alloc(16)
await fh.read(head, 0, 16, 0)
const headerStringSize = head.readUInt32LE(12)
const buf = Buffer.alloc(headerStringSize)
await fh.read(buf, 0, headerStringSize, 16)
const header = JSON.parse(buf.toString('utf8'))

const hits = []
function walk(node, prefix) {
  if (!node || typeof node !== 'object') return
  for (const [name, child] of Object.entries(node.files ?? {})) {
    const p = prefix + '/' + name
    if (p.includes(needle)) hits.push({ path: p, dir: child.files !== undefined, size: child.size })
    if (child.files !== undefined) walk(child, p)
  }
}
walk(header, '')
console.log(JSON.stringify(hits.slice(0, 40), null, 1))
console.log('total hits:', hits.length)
await fh.close()
