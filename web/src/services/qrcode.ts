// Minimal in-house QR code encoder (no dependency): byte mode, error-correction
// level M, versions 1 to 10 (up to 213 bytes of payload). Used to show a share
// link that a phone can scan from the place panel. Follows ISO/IEC 18004.

export type QrMatrix = boolean[][]   // matrix[y][x] — true = dark module

// Per-version tables (index = version - 1), level M.
const TOTAL_CODEWORDS = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346]
const EC_PER_BLOCK    = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26]
const NUM_BLOCKS      = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5]
const ALIGN_CENTRES: number[][] = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
]

const dataCapacity = (v: number) => TOTAL_CODEWORDS[v - 1] - EC_PER_BLOCK[v - 1] * NUM_BLOCKS[v - 1]

// ── GF(256) arithmetic (primitive polynomial 0x11D) ───────────────────────────
const EXP = new Uint8Array(512), LOG = new Uint8Array(256)
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x = (x << 1) ^ (x & 0x80 ? 0x11D : 0) }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]
const gfMul = (a: number, b: number) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]

function rsRemainder(data: number[], ecLen: number): number[] {
  // Generator polynomial (x - α^0)(x - α^1)…(x - α^(ecLen-1)).
  let gen = [1]
  for (let i = 0; i < ecLen; i++) {
    const next = new Array<number>(gen.length + 1).fill(0)
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j]
      next[j + 1] ^= gfMul(gen[j], EXP[i])
    }
    gen = next
  }
  const rem = new Array<number>(ecLen).fill(0)
  for (const b of data) {
    const factor = b ^ rem.shift()!
    rem.push(0)
    for (let j = 0; j < ecLen; j++) rem[j] ^= gfMul(gen[j + 1], factor)
  }
  return rem
}

// ── Bit stream → codewords ────────────────────────────────────────────────────
function buildCodewords(bytes: Uint8Array, version: number): number[] {
  const bits: number[] = []
  const push = (val: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1) }
  push(0b0100, 4)                                // byte mode
  push(bytes.length, version <= 9 ? 8 : 16)      // character count indicator
  for (const b of bytes) push(b, 8)
  const capBits = dataCapacity(version) * 8
  push(0, Math.min(4, capBits - bits.length))    // terminator
  while (bits.length % 8) bits.push(0)
  for (let pad = 0xEC; bits.length < capBits; pad ^= 0xEC ^ 0x11) push(pad, 8)
  const data: number[] = []
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2))

  // Split into blocks (short blocks first, long blocks = short + 1), append EC, interleave.
  const nb = NUM_BLOCKS[version - 1], ec = EC_PER_BLOCK[version - 1]
  const short = Math.floor(data.length / nb), longCount = data.length % nb
  const blocks: number[][] = [], ecs: number[][] = []
  for (let b = 0, off = 0; b < nb; b++) {
    const len = short + (b >= nb - longCount ? 1 : 0)
    const chunk = data.slice(off, off + len); off += len
    blocks.push(chunk); ecs.push(rsRemainder(chunk, ec))
  }
  const out: number[] = []
  for (let i = 0; i <= short; i++) for (const b of blocks) if (i < b.length) out.push(b[i])
  for (let i = 0; i < ec; i++) for (const e of ecs) out.push(e[i])
  return out
}

// ── Matrix construction ───────────────────────────────────────────────────────
function makeMatrix(version: number, codewords: number[]): { modules: QrMatrix; fn: boolean[][] } {
  const size = version * 4 + 17
  const modules: QrMatrix = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const fn: boolean[][]   = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const set = (x: number, y: number, dark: boolean) => { if (x >= 0 && y >= 0 && x < size && y < size) { modules[y][x] = dark; fn[y][x] = true } }

  // Finder patterns + separators.
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy))
      set(cx + dx, cy + dy, d !== 2 && d !== 4)
    }
  }
  // Timing patterns.
  for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0) }
  // Alignment patterns (skip the three overlapping the finders).
  const centres = ALIGN_CENTRES[version - 1], last = centres.length - 1
  for (let i = 0; i < centres.length; i++) for (let j = 0; j < centres.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
      set(centres[i] + dx, centres[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
  }
  // Reserve format info areas (filled once the mask is chosen) + dark module.
  for (let i = 0; i < 9; i++) { set(8, i, false); set(i, 8, false) }
  for (let i = 0; i < 8; i++) { set(size - 1 - i, 8, false); set(8, size - 1 - i, false) }
  set(8, size - 8, true)
  // Version info (v ≥ 7): 18-bit BCH(18,6).
  if (version >= 7) {
    let rem = version
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25)
    const bits = (version << 12) | rem
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3), b = Math.floor(i / 3), dark = ((bits >>> i) & 1) === 1
      set(a, b, dark); set(b, a, dark)
    }
  }
  // Zigzag placement of the codeword bits.
  let bi = 0
  const total = codewords.length * 8
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert
      if (!fn[y][x] && bi < total) { modules[y][x] = ((codewords[bi >>> 3] >>> (7 - (bi & 7))) & 1) === 1; bi++ }
    }
  }
  return { modules, fn }
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
  (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0,
  (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0,
]

function applyMask(m: QrMatrix, fn: boolean[][], mask: number) {
  const size = m.length
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[mask](x, y)) m[y][x] = !m[y][x]
}

function drawFormat(m: QrMatrix, mask: number) {
  const size = m.length
  const data = (0b00 << 3) | mask      // level M = 00
  let rem = data
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
  const bits = ((data << 10) | rem) ^ 0x5412
  const bit = (i: number) => ((bits >>> i) & 1) === 1
  for (let i = 0; i <= 5; i++) m[i][8] = bit(i)
  m[7][8] = bit(6); m[8][8] = bit(7); m[8][7] = bit(8)
  for (let i = 9; i < 15; i++) m[8][14 - i] = bit(i)
  for (let i = 0; i < 8; i++) m[8][size - 1 - i] = bit(i)
  for (let i = 8; i < 15; i++) m[size - 15 + i][8] = bit(i)
  m[size - 8][8] = true
}

// Penalty score (ISO 18004 §7.8.3) — lower is better.
function penalty(m: QrMatrix): number {
  const size = m.length
  let score = 0
  const runs = (get: (i: number) => boolean) => {
    let run = 0, prev = false, s = ''
    for (let i = 0; i < size; i++) {
      const v = get(i); s += v ? '1' : '0'
      if (v === prev && i > 0) { run++; if (run === 5) score += 3; else if (run > 5) score += 1 } else run = 1
      prev = v
    }
    // Finder-like patterns 1011101 with 4 light modules on one side.
    for (const p of ['00001011101', '10111010000']) for (let i = s.indexOf(p); i !== -1; i = s.indexOf(p, i + 1)) score += 40
  }
  for (let y = 0; y < size; y++) runs(x => m[y][x])
  for (let x = 0; x < size; x++) runs(y => m[y][x])
  let dark = 0
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (m[y][x]) dark++
    if (x < size - 1 && y < size - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3
  }
  const k = Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size))
  return score + k * 10
}

/** Encodes `text` (UTF-8) as a QR matrix, or null when it exceeds version 10 at level M. */
export function encodeQr(text: string): QrMatrix | null {
  const bytes = new TextEncoder().encode(text)
  let version = 0
  for (let v = 1; v <= 10; v++) {
    const overhead = 4 + (v <= 9 ? 8 : 16)
    if (bytes.length * 8 + overhead <= dataCapacity(v) * 8) { version = v; break }
  }
  if (!version) return null
  const codewords = buildCodewords(bytes, version)
  let best: QrMatrix | null = null, bestScore = Infinity
  for (let mask = 0; mask < 8; mask++) {
    const { modules, fn } = makeMatrix(version, codewords)
    applyMask(modules, fn, mask)
    drawFormat(modules, mask)
    const s = penalty(modules)
    if (s < bestScore) { bestScore = s; best = modules }
  }
  return best
}

/** SVG path (`d` attribute) drawing every dark module as a 1×1 square, with a quiet zone of `margin`. */
export function qrSvgPath(m: QrMatrix, margin = 4): { d: string; size: number } {
  const parts: string[] = []
  for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) if (m[y][x]) parts.push(`M${x + margin} ${y + margin}h1v1h-1z`)
  return { d: parts.join(''), size: m.length + margin * 2 }
}
