import { sha256 } from '@noble/hashes/sha2.js'

// ── Hex encoding ─────────────────────────────────────────────────────────────

/** Convert a Uint8Array to a lowercase hex string */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Convert a hex string to Uint8Array */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string')
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2)
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  return bytes
}

/** Concatenate multiple Uint8Arrays */
export function concat(...arrs: Uint8Array[]): Uint8Array {
  const len = arrs.reduce((s, a) => s + a.length, 0)
  const out = new Uint8Array(len)
  let off = 0
  for (const a of arrs) { out.set(a, off); off += a.length }
  return out
}

// ── Little-endian encoding ────────────────────────────────────────────────────

export function u16LE(n: number): Uint8Array {
  return new Uint8Array([n & 0xff, (n >> 8) & 0xff])
}

export function u32LE(n: number): Uint8Array {
  const b = new Uint8Array(4)
  new DataView(b.buffer).setUint32(0, n, true)
  return b
}

export function u64LE(n: bigint): Uint8Array {
  const b = new Uint8Array(8)
  new DataView(b.buffer).setBigUint64(0, n, true)
  return b
}

// ── Domain hash ───────────────────────────────────────────────────────────────

/**
 * Exfer domain hash:
 * SHA-256( len(separator) || separator || data )
 */
export function domainHash(separator: string, data: Uint8Array): Uint8Array {
  const sep = new TextEncoder().encode(separator)
  const buf = new Uint8Array(1 + sep.length + data.length)
  buf[0] = sep.length
  buf.set(sep, 1)
  buf.set(data, 1 + sep.length)
  return sha256(buf)
}

// ── Amount formatting ─────────────────────────────────────────────────────────

/**
 * Format exfers (base units) as a human-readable EXFER string.
 * @example formatExfer(9999999900n) // "99.999999"
 */
export function formatExfer(exfers: bigint | number): string {
  const n = typeof exfers === 'bigint' ? exfers : BigInt(Math.floor(exfers))
  const whole = n / 100_000_000n
  const frac  = n % 100_000_000n
  if (frac === 0n) return whole.toLocaleString()
  return `${whole.toLocaleString()}.${frac.toString().padStart(8, '0').replace(/0+$/, '')}`
}

/**
 * Parse a human-readable EXFER string to exfers (base units).
 * @example parseExfer("99.999999") // 9999999900n
 */
export function parseExfer(input: string): bigint {
  const trimmed = input.trim().replace(/\s*EXFER\s*/i, '')
  if (trimmed.includes('.')) {
    const [whole, frac] = trimmed.split('.')
    const fracPadded = frac.padEnd(8, '0').slice(0, 8)
    return BigInt(whole || '0') * 100_000_000n + BigInt(fracPadded)
  }
  return BigInt(trimmed)
}

/**
 * Estimate block reward at a given height.
 * R(height) = BASE + DECAY × 2^(-height / HALF_LIFE)
 */
export function estimateBlockReward(height: number): number {
  return 1 + 99 * Math.pow(2, -height / 6_307_200)
}
