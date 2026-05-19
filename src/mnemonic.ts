import { sha256 } from '@noble/hashes/sha2.js'
import { generateMnemonic as bip39Generate, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { concat } from './utils.js'
import { keyPairFromSeed, type KeyPair } from './crypto.js'

/**
 * Generate a new 24-word BIP39 mnemonic phrase.
 */
export function createMnemonic(): string {
  return bip39Generate(wordlist, 256)
}

/**
 * Validate a BIP39 mnemonic phrase.
 */
export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic, wordlist)
}

/**
 * Derive an Exfer key pair from a BIP39 mnemonic phrase.
 *
 * Derivation path (official Exfer):
 * 1. BIP39 seed = PBKDF2-HMAC-SHA512(mnemonic, "mnemonic", 2048) → 64 bytes
 * 2. Private seed = SHA256("EXFER-MNEMONIC-ED25519-V1" || bip39_seed) → 32 bytes
 * 3. Key pair from seed
 */
export async function walletFromMnemonic(mnemonic: string): Promise<KeyPair> {
  const words = mnemonic.trim().toLowerCase()
  if (!isValidMnemonic(words)) throw new Error('Invalid mnemonic phrase')

  // Step 1: BIP39 → 64-byte seed
  const bip39Seed = mnemonicToSeedSync(words)

  // Step 2: Domain-derived private seed
  const tag = new TextEncoder().encode('EXFER-MNEMONIC-ED25519-V1')
  const input = new Uint8Array(tag.length + bip39Seed.length)
  input.set(tag)
  input.set(bip39Seed, tag.length)
  const privSeed = sha256(input)

  return keyPairFromSeed(privSeed)
}

export { createMnemonic as generateMnemonic }
