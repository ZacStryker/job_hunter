function crc32(buf: Buffer): number {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    table[i] = c
  }
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) crc = (table[(crc ^ buf[i]!) & 0xFF]! ^ (crc >>> 8)) >>> 0
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function u16(v: number): Buffer { const b = Buffer.alloc(2); b.writeUInt16LE(v, 0); return b }
function u32(v: number): Buffer { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0, 0); return b }

function buildZip(files: Array<{ name: string; data: Buffer }>): Buffer {
  const entries = files.map(({ name, data }) => {
    const nb = Buffer.from(name, 'utf8')
    const crc = crc32(data)
    const local = Buffer.concat([
      Buffer.from([0x50, 0x4B, 0x03, 0x04]),
      u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length),
      u16(nb.length), u16(0), nb,
    ])
    return { local, data, nb, crc, size: data.length }
  })
  const parts: Buffer[] = []
  const cdParts: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    parts.push(e.local, e.data)
    cdParts.push(Buffer.concat([
      Buffer.from([0x50, 0x4B, 0x01, 0x02]),
      u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(e.crc), u32(e.size), u32(e.size),
      u16(e.nb.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset),
      e.nb,
    ]))
    offset += e.local.length + e.size
  }
  const cd = Buffer.concat(cdParts)
  const eocd = Buffer.concat([
    Buffer.from([0x50, 0x4B, 0x05, 0x06]),
    u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(cd.length), u32(offset), u16(0),
  ])
  return Buffer.concat([...parts, cd, eocd])
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function buildDocx(coverLetter: string): Buffer {
  const paragraphs = coverLetter.split('\n').map(line => {
    const t = escXml(line)
    return t
      ? `<w:p><w:r><w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`
      : `<w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>`
  }).join('')

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
  const wordRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`

  return buildZip([
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(rootRels, 'utf8') },
    { name: 'word/document.xml', data: Buffer.from(documentXml, 'utf8') },
    { name: 'word/_rels/document.xml.rels', data: Buffer.from(wordRels, 'utf8') },
  ])
}
