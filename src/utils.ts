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
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string: odd length')
  if (hex.length > 0 && !/^[0-9a-fA-F]+$/.test(hex))
    throw new Error('Invalid hex string: non-hex characters')
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
 * Accepts bigint, number, or string.
 * @example formatExfer(9999999900n) // "99.999999"
 */
export function formatExfer(exfers: bigint | number | string): string {
  if (typeof exfers === 'number' && !Number.isFinite(exfers))
    throw new Error(`formatExfer: cannot format non-finite number (${exfers})`)
  const n = BigInt(typeof exfers === 'number' ? Math.floor(exfers) : exfers)
  const whole = n / 100_000_000n
  const frac  = n % 100_000_000n
  if (frac === 0n) return whole.toLocaleString()
  return `${whole.toLocaleString()}.${frac.toString().padStart(8, '0').replace(/0+$/, '')}`
}

/**
 * Parse a human-readable EXFER string to exfers (base units).
 * Both integer ("1") and decimal ("1.5") inputs are treated as EXFER,
 * not as raw exfers — i.e. "1" → 100_000_000n, "1.5" → 150_000_000n.
 * @example parseExfer("1")        // 100_000_000n  (1 EXFER)
 * @example parseExfer("1.5")      // 150_000_000n
 * @example parseExfer("0.000001") // 100n
 */
export function parseExfer(input: string): bigint {
  // Strip whitespace, EXFER suffix, and thousands separators (commas)
  const trimmed = input.trim().replace(/\s*EXFER\s*/i, '').replace(/,/g, '')
  if (!trimmed || trimmed === '.') return 0n
  if (trimmed.includes('.')) {
    const [whole, frac] = trimmed.split('.')
    const fracPadded = frac.padEnd(8, '0').slice(0, 8)
    return BigInt(whole || '0') * 100_000_000n + BigInt(fracPadded)
  }
  return BigInt(trimmed) * 100_000_000n
}

/**
 * Shorten an address for display: "abcd1234…efgh5678"
 * @example shortAddr("abcdef1234567890...") // "abcdef1234…5678"
 */
export function shortAddr(addr: string): string {
  return addr.length > 16 ? `${addr.slice(0, 10)}…${addr.slice(-8)}` : addr
}

/**
 * Shorten a block hash or tx ID for display: "abcd1234…efgh5678"
 * Identical to shortAddr but semantically named for hashes.
 */
export function shortHash(hash: string): string {
  return hash.length > 16 ? `${hash.slice(0, 10)}…${hash.slice(-8)}` : hash
}

/**
 * Format a hash rate number as a human-readable string.
 * @example formatHashrate(1_500_000) // "1.50 MH/s"
 * @example formatHashrate(3_200)     // "3.20 KH/s"
 * @example formatHashrate(42)        // "42 H/s"
 */
export function formatHashrate(hr: number): string {
  if (hr >= 1_000_000) return `${(hr / 1_000_000).toFixed(2)} MH/s`
  if (hr >= 1_000)     return `${(hr / 1_000).toFixed(2)} KH/s`
  return `${hr} H/s`
}

/**
 * Convert a Unix timestamp to a human-readable relative time string.
 * @example timeAgo(Date.now() / 1000 - 90)  // "1m ago"
 * @example timeAgo(Date.now() / 1000 - 7200) // "2h ago"
 */
export function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts
  if (diff <= 0)     return 'just now'
  if (diff < 60)     return `${diff}s ago`
  if (diff < 3_600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86_400) return `${Math.floor(diff / 3_600)}h ago`
  return `${Math.floor(diff / 86_400)}d ago`
}

/**
 * Estimate block reward at a given height.
 * R(height) = BASE + DECAY × 2^(-height / HALF_LIFE)
 */
export function estimateBlockReward(height: number): number {
  return 1 + 99 * Math.pow(2, -height / 6_307_200)
}
