// ── Constants ─────────────────────────────────────────────────────────────────
export {
  GENESIS_BLOCK_ID,
  EXFERS_PER_EXFER,
  DUST_THRESHOLD,
  MIN_FEE,
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
  shortAddr,
  shortHash,
  formatHashrate,
  timeAgo,
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
export { buildTransaction, buildBatchTransaction, estimateFee } from './transaction.js'
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
  OutputSpentBy,
  HtlcInfo,
} from './rpc.js'

// ── Exchange ──────────────────────────────────────────────────────────────────
export { ExferRestClient, createRestClient, sendWithdrawal } from './exchange.js'
export type {
  Deposit,
  BalanceMap,
  FeeSuggestions,
  MempoolOutput,
  PendingTx,
  MempoolData,
  ActivityItem,
  AddressInfo,
  NetworkStats,
  WhaleItem,
  WhalesResponse,
  BlockTxSummary,
  BlockDetail,
  BlockSummary,
  BlocksResponse,
  TxOutputItem,
  TxDetail,
  HashratePoint,
  HashrateHistory,
  BlockTimePoint,
  BlockTimeHistory,
  DailyPoint,
  DailyStats,
  MinerItem,
  MinersStats,
  RichListItem,
  RichListResponse,
  SearchResult,
  BatchAddressItem,
  BatchAddressesResponse,
  UtxoItemRest,
  UtxosResponse,
  WithdrawalParams,
  WithdrawalResult,
} from './exchange.js'
