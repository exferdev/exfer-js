// ── Constants ─────────────────────────────────────────────────────────────────
export {
  GENESIS_BLOCK_ID,
  EXFERS_PER_EXFER,
  DUST_THRESHOLD,
  DEFAULT_FEE,
  REWARD_BASE,
  REWARD_DECAY,
  REWARD_HALF_LIFE,
} from './constants.js'

// ── Utilities ─────────────────────────────────────────────────────────────────
export {
  bytesToHex,
  hexToBytes,
  concat,
  u16LE,
  u32LE,
  u64LE,
  domainHash,
  formatExfer,
  parseExfer,
  estimateBlockReward,
} from './utils.js'

// ── Cryptography ──────────────────────────────────────────────────────────────
export {
  keyPairFromSeed,
  importKeyFile,
  sign,
} from './crypto.js'
export type { KeyPair, WalletKeyFile } from './crypto.js'

// ── Mnemonic ──────────────────────────────────────────────────────────────────
export {
  createMnemonic,
  generateMnemonic,
  isValidMnemonic,
  walletFromMnemonic,
} from './mnemonic.js'

// ── Transaction ───────────────────────────────────────────────────────────────
export { buildTransaction, buildBatchTransaction } from './transaction.js'
export type { Utxo, TxOutput, UnsignedTx, SignedTx, BatchRecipient } from './transaction.js'

// ── RPC Client ────────────────────────────────────────────────────────────────
export { ExferRpcClient, createClient } from './rpc.js'
export type {
  BlockHeight,
  Block,
  Transaction,
  AddressUtxos,
  AddressBalance,
  BroadcastResult,
} from './rpc.js'

// ── Exchange ──────────────────────────────────────────────────────────────────
export { ExferRestClient, createRestClient, sendWithdrawal } from './exchange.js'
export type {
  Deposit,
  BalanceMap,
  WithdrawalParams,
  WithdrawalResult,
} from './exchange.js'
