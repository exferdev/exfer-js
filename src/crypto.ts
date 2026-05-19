import { sha256, sha512 } from '@noble/hashes/sha2.js'
import { concat, domainHash, bytesToHex, hexToBytes } from './utils.js'

// ── Ed25519 via Web Crypto API ────────────────────────────────────────────────

function pkcs8Wrap(seed: Uint8Array): ArrayBuffer {
  const prefix = new Uint8Array([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
    0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
  ])
  const buf = concat(prefix, seed)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

async function getPublicKeyFromSeed(seed: Uint8Array): Promise<Uint8Array> {
  try {
    const priv = await crypto.subtle.importKey(
      'pkcs8', pkcs8Wrap(seed), { name: 'Ed25519' }, true, ['sign'],
    )
    const jwk = await crypto.subtle.exportKey('jwk', priv)
    delete (jwk as Record<string, unknown>).d
    ;(jwk as Record<string, unknown>).key_ops = ['verify']
    const pub = await crypto.subtle.importKey(
      'jwk', jwk, { name: 'Ed25519' }, true, ['verify'],
    )
    return new Uint8Array(await crypto.subtle.exportKey('raw', pub))
  } catch {
    return ed25519PublicKeyManual(seed)
  }
}

async function signEd25519(message: Uint8Array, seed: Uint8Array): Promise<Uint8Array> {
  try {
    const key = await crypto.subtle.importKey(
      'pkcs8', pkcs8Wrap(seed), { name: 'Ed25519' }, false, ['sign'],
    )
    const msgBuf = message.buffer.slice(message.byteOffset, message.byteOffset + message.byteLength) as ArrayBuffer
    return new Uint8Array(await crypto.subtle.sign('Ed25519', key, msgBuf))
  } catch {
    return ed25519SignManual(message, seed)
  }
}

// ── Manual Ed25519 fallback ───────────────────────────────────────────────────

const P = 2n ** 255n - 19n
const L = 2n ** 252n + 27742317777372353535851937790883648493n
const D = -121665n * modInv(121666n, P) % P

function mod(a: bigint, m: bigint): bigint { const r = a % m; return r >= 0n ? r : r + m }
function modInv(a: bigint, m: bigint): bigint { return modPow(mod(a, m), m - 2n, m) }
function modPow(b: bigint, e: bigint, m: bigint): bigint {
  let r = 1n; b = mod(b, m)
  while (e > 0n) { if (e & 1n) r = mod(r * b, m); e >>= 1n; b = mod(b * b, m) }
  return r
}

type Point = [bigint, bigint, bigint, bigint]
const ZERO: Point = [0n, 1n, 1n, 0n]

const BASE: Point = (() => {
  const y = 4n * modInv(5n, P) % P
  const y2 = mod(y * y, P)
  const x2 = mod((y2 - 1n) * modInv(D * y2 + 1n, P), P)
  let x = modPow(x2, (P + 3n) / 8n, P)
  if (mod(x * x, P) !== x2) x = mod(x * modPow(2n, (P - 1n) / 4n, P), P)
  if ((x & 1n) !== 0n) x = P - x
  return [x, y, 1n, mod(x * y, P)] as Point
})()

function pointAdd(p: Point, q: Point): Point {
  const [x1,y1,z1,t1] = p; const [x2,y2,z2,t2] = q
  const a = mod((y1-x1)*(y2-x2),P), b = mod((y1+x1)*(y2+x2),P)
  const c = mod(2n*t1*t2*D,P), d = mod(2n*z1*z2,P)
  const e=b-a, f=d-c, g=d+c, h=b+a
  return [mod(e*f,P),mod(g*h,P),mod(f*g,P),mod(e*h,P)]
}

function pointMul(p: Point, n: bigint): Point {
  let r: Point = ZERO; let c: Point = p; n = mod(n, L)
  while (n > 0n) { if (n & 1n) r = pointAdd(r, c); c = pointAdd(c, c); n >>= 1n }
  return r
}

function pointToBytes(p: Point): Uint8Array {
  const [x,y,z] = p; const zi = modInv(z,P)
  const xn = mod(x*zi,P); const yn = mod(y*zi,P)
  const bytes = new Uint8Array(32)
  let v = yn
  for (let i = 0; i < 32; i++) { bytes[i] = Number(v & 0xFFn); v >>= 8n }
  if (xn & 1n) bytes[31] |= 0x80
  return bytes
}

function leToInt(bytes: Uint8Array): bigint {
  let r = 0n
  for (let i = bytes.length - 1; i >= 0; i--) r = (r << 8n) | BigInt(bytes[i])
  return r
}

function clamp(h: Uint8Array): bigint {
  const c = new Uint8Array(h.slice(0, 32))
  c[0] &= 248; c[31] &= 127; c[31] |= 64
  return leToInt(c)
}

function ed25519PublicKeyManual(seed: Uint8Array): Uint8Array {
  const h = sha512(seed)
  return pointToBytes(pointMul(BASE, clamp(h)))
}

function ed25519SignManual(message: Uint8Array, seed: Uint8Array): Uint8Array {
  const h = sha512(seed)
  const scalar = clamp(h)
  const prefix = h.slice(32, 64)
  const pubKey = pointToBytes(pointMul(BASE, scalar))
  const r = mod(leToInt(sha512(concat(prefix, message))), L)
  const R = pointToBytes(pointMul(BASE, r))
  const k = mod(leToInt(sha512(concat(R, pubKey, message))), L)
  const S = mod(r + k * scalar, L)
  const Sb = new Uint8Array(32)
  let sv = S
  for (let i = 0; i < 32; i++) { Sb[i] = Number(sv & 0xFFn); sv >>= 8n }
  return concat(R, Sb)
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface KeyPair {
  /** 32-byte private key seed */
  privateKey: Uint8Array
  /** 32-byte Ed25519 public key */
  publicKey: Uint8Array
  /** 32-byte Exfer address (domain_hash("EXFER-ADDR", pubkey)) */
  address: Uint8Array
  /** Hex-encoded address */
  addressHex: string
  /** Hex-encoded public key */
  publicKeyHex: string
}

/**
 * Derive an Exfer key pair from a 32-byte seed.
 * Uses the official derivation: address = domain_hash("EXFER-ADDR", pubkey)
 */
export async function keyPairFromSeed(seed: Uint8Array): Promise<KeyPair> {
  if (seed.length !== 32) throw new Error('Seed must be 32 bytes')
  const publicKey = await getPublicKeyFromSeed(seed)
  const address   = domainHash('EXFER-ADDR', publicKey)
  return {
    privateKey:   seed,
    publicKey,
    address,
    addressHex:   bytesToHex(address),
    publicKeyHex: bytesToHex(publicKey),
  }
}

/**
 * Sign arbitrary data with an Ed25519 private key seed.
 */
export async function sign(message: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array> {
  return signEd25519(message, privateKey)
}

// ── wallet.key import ─────────────────────────────────────────────────────────

export interface WalletKeyFile {
  privateKey: Uint8Array
  publicKey:  Uint8Array
  address:    Uint8Array
  addressHex: string
  publicKeyHex: string
}

/**
 * Import an official Exfer wallet.key file.
 *
 * File format: EXFK(4) + version(1) + salt(16) + nonce(12) + ct(32) + tag(16)
 * KDF: Argon2id  m=65536 t=2 p=1
 * Cipher: AES-256-GCM
 *
 * @param fileBytes - Raw bytes of the .key file
 * @param passphrase - The passphrase used when generating the wallet
 */
export async function importKeyFile(
  fileBytes: Uint8Array,
  passphrase: string,
): Promise<WalletKeyFile> {
  if (fileBytes.length < 81) throw new Error('Invalid key file: too short')
  const magic = String.fromCharCode(...fileBytes.slice(0, 4))
  if (magic !== 'EXFK') throw new Error('Invalid key file: bad magic bytes')
  const version = fileBytes[4]
  if (version !== 1) throw new Error(`Unsupported key file version: ${version}`)

  const salt  = fileBytes.slice(5, 21)
  const nonce = fileBytes.slice(21, 33)
  const ct    = fileBytes.slice(33, 65)
  const tag   = fileBytes.slice(65, 81)

  const { argon2id } = await import('@noble/hashes/argon2.js')
  const key = argon2id(new TextEncoder().encode(passphrase), salt, {
    m: 262_144, t: 3, p: 1, dkLen: 32,
  })

  const cryptoKey = await crypto.subtle.importKey(
    'raw', key, { name: 'AES-GCM' }, false, ['decrypt'],
  )

  const ctWithTag = new Uint8Array(ct.length + tag.length)
  ctWithTag.set(ct); ctWithTag.set(tag, ct.length)

  let seed: Uint8Array
  try {
    seed = new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, cryptoKey, ctWithTag),
    )
  } catch {
    throw new Error('Decryption failed: wrong passphrase or corrupted file')
  }

  return keyPairFromSeed(seed)
}

export { bytesToHex, hexToBytes, domainHash }
