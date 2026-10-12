/**
 * [INPUT]: Bounded image bytes from the public transport.
 * [OUTPUT]: Signature/dimension validation for inert raster images.
 * [POS]: Shared validation for preview covers and favicon payloads.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export function raster(bytes: Buffer, maximumSide = 8192, maximumPixels = 20_000_000): 'png' | 'jpeg' | 'webp' | null {
  let width = 0; let height = 0; let mime: 'png' | 'jpeg' | 'webp' | null = null
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString('ascii', 12, 16) === 'IHDR') {
    mime = 'png'; width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20)
  } else if (bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) break
      const marker = bytes[at + 1]!
      if (marker === 0xff) { at++; continue }
      if (marker === 0xda || marker === 0xd9) break
      const length = bytes.readUInt16BE(at + 2)
      if (length < 2 || at + 2 + length > bytes.length) break
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        mime = 'jpeg'; height = bytes.readUInt16BE(at + 5); width = bytes.readUInt16BE(at + 7); break
      }
      at += 2 + length
    }
  } else if (bytes.length >= 30 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    const format = bytes.toString('ascii', 12, 16)
    if (format === 'VP8X') { width = 1 + bytes.readUIntLE(24, 3); height = 1 + bytes.readUIntLE(27, 3) }
    else if (format === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) { width = bytes.readUInt16LE(26) & 0x3fff; height = bytes.readUInt16LE(28) & 0x3fff }
    else if (format === 'VP8L' && bytes[20] === 0x2f) { const bits = bytes.readUInt32LE(21); width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1 }
    mime = 'webp'
  }
  return width > 0 && height > 0 && width <= maximumSide && height <= maximumSide && width * height <= maximumPixels ? mime : null
}

