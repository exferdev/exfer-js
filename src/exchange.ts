import { buildTransaction, type Utxo, type SignedTx } from './transaction.js'
import { ExferRpcClient } from './rpc.js'
import { DEFAULT_FEE } from './constants.js'

// ── REST response types (internal) ───────────────────────────────────────────

interface ApiStats {
  tip_height: number
}

interface ApiDeposit {
  tx_id:        string
  block_height: number
  timestamp:    number
  value:        string
  value_raw:    string
}

interface ApiTx {
  block_height?: number
  block_hash?:   string
}

interface ApiAddressBalance {
  balance_raw: string
}

// ── Public types ──────────────────────────────────────────────────────────────

/** A confirmed incoming deposit to a monitored address */
export interface Deposit {
  txId:            string
  blockHeight:     number
  timestamp:       number
  /** Amount in exfers (base units, 1 EXFER = 100_000_000) */
  amount:          bigint
  /** Human-readable amount, e.g. "12.50" */
  amountFormatted: string
}

/** Result of a batch balance query */
export type BalanceMap = Record<string, bigint>

/**
 * Network fee suggestions from GET /api/stats/fees.
 * Values are human-readable EXFER strings (e.g. "0.00000088").
 * Use parseExfer() to convert to base units for transaction building.
 */
export interface FeeSuggestions {
  /** Absolute minimum fee (88 exfers = 0.00000088 EXFER) */
  min_fee: string
  /** Average fee tier (880 exfers = 0.0000088 EXFER) */
  average: string
  /** Fast fee tier (8800 exfers = 0.000088 EXFER) */
  fast:    string
}

/** A single output referenced in a pending mempool transaction */
export interface MempoolOutput {
  output_index: number
  /** Amount in exfers (base units) */
  value:        number
  /** Recipient address (hex), present on received outputs */
  address?:     string
}

/** A pending (unconfirmed) transaction involving an address */
export interface PendingTx {
  tx_id:    string
  status:   'pending'
  /** Outputs being received by this address */
  received: MempoolOutput[]
  /** Outputs being spent from this address */
  spent:    MempoolOutput[]
}

/** Mempool state for an address from GET /address/:addr/mempool */
export interface MempoolData {
  address:               string
  pending_count:         number
  /** Human-readable net pending received (e.g. "1.5") */
  pending_received:      string
  pending_received_raw:  string
  /** Human-readable net pending sent */
  pending_sent:          string
  pending_sent_raw:      string
  /** Human-readable net pending balance change */
  pending_balance:       string
  pending_balance_raw:   string
  pending_txs:           PendingTx[]
}

/** A single activity entry in address history */
export interface ActivityItem {
  tx_id:        string
  block_height: number
  timestamp:    number
  direction:    'RECEIVED' | 'SENT'
  value:        string
}

/** Full address information from GET /address/:addr */
export interface AddressInfo {
  address:       string
  /** Human-readable balance (e.g. "42.5") */
  balance:       string
  balance_raw?:  string
  utxo_count:    number
  tx_count:      number
  /** Unix timestamp of the first transaction seen */
  first_seen?:   number
  /** Unix timestamp of the most recent transaction */
  last_seen?:    number
  /** Current page of activity */
  page?:         number
  /** Total pages of activity */
  pages?:        number
  activity:      ActivityItem[]
}

/** Full network statistics from GET /stats */
export interface NetworkStats {
  tip_height:            number
  last_block_timestamp:  number
  /** Current block reward as human-readable EXFER string */
  block_reward:          string
  /** Total indexed supply as human-readable EXFER string */
  indexed_supply:        string
  /** Average block time in seconds */
  avg_block_time:        number
  /** Average hash rate in H/s */
  avg_hashrate:          number
}

/** A single large-value ("whale") transaction from GET /whales */
export interface WhaleItem {
  tx_id:        string
  address:      string
  direction:    'RECEIVED' | 'SENT'
  value:        string
  /** Exact value in exfers as string */
  value_raw?:   string
  block_height: number
  timestamp:    number
}

/** Response from GET /whales */
export interface WhalesResponse {
  total:        number
  total_volume: string
  /** Current page */
  page?:        number
  /** Total pages */
  pages?:       number
  items:        WhaleItem[]
}

/** A transaction summary inside a block's transaction list */
export interface BlockTxSummary {
  tx_id:       string
  position:    number
  is_coinbase: boolean
  size:        number
  total_in:    string
  total_out:   string
  fee:         string
}

/**
 * Enriched block detail from GET /block/:id (REST).
 * Contains more fields than the RPC `get_block` response.
 */
export interface BlockDetail {
  height:              number
  hash:                string
  prev_hash?:          string
  timestamp:           number
  tx_count:            number
  /** Block size in bytes */
  size:                number
  /** Coinbase recipient address (miner) */
  miner:               string
  /** Block reward as human-readable EXFER string */
  reward:              string
  difficulty_target?:  string
  nonce?:              string
  transactions?:       BlockTxSummary[]
}

/** A summary row in the block list from GET /blocks */
export interface BlockSummary {
  height:    number
  hash:      string
  timestamp: number
  tx_count:  number
  size:      number
  miner:     string
  reward:    string
}

/** Response from GET /blocks */
export interface BlocksResponse {
  total:  number
  page:   number
  pages:  number
  blocks: BlockSummary[]
}

/** A single output in a transaction from GET /tx/:tx_id */
export interface TxOutputItem {
  index:   number
  address: string
  value:   string
  spent:   boolean
  /** Transaction that spent this output (null if unspent) */
  spent_by_tx_id?: string | null
}

/**
 * Enriched transaction detail from GET /tx/:tx_id (REST).
 * Contains more fields than the RPC `get_transaction` response.
 */
export interface TxDetail {
  tx_id:        string
  block_height: number
  block_hash?:  string
  timestamp:    number
  is_coinbase:  boolean
  /** Transaction size in bytes */
  size:         number
  /** Total input value as human-readable EXFER string */
  total_in:     string
  /** Total output value as human-readable EXFER string */
  total_out:    string
  /** Fee as human-readable EXFER string */
  fee:          string
  outputs?:     TxOutputItem[]
}

/** A single data point for hashrate history */
export interface HashratePoint {
  timestamp: number
  hashrate:  number
  height:    number
}

/** Response from GET /stats/hashrate */
export interface HashrateHistory {
  /** Average hash rate over the period (H/s) */
  avg:  number
  /** Most recent hash rate (H/s) */
  last: number
  data: HashratePoint[]
}

/** A single data point for block time history */
export interface BlockTimePoint {
  timestamp:  number
  block_time: number
  height:     number
}

/** Response from GET /stats/blocktime */
export interface BlockTimeHistory {
  /** Average block time over the period (seconds) */
  avg:  number
  /** Most recent block time (seconds) */
  last: number
  data: BlockTimePoint[]
}

/** A single data point for daily block/tx stats */
export interface DailyPoint {
  date:        string
  block_count: number
  tx_count:    number
}

/** Response from GET /stats/daily */
export interface DailyStats {
  /** Average daily block count */
  avg:  number
  data: DailyPoint[]
}

/** A single miner entry from GET /stats/miners */
export interface MinerItem {
  address:       string
  address_short: string
  blocks:        number
  /** Percentage share of blocks (0–100) */
  share:         number
}

/** Response from GET /stats/miners */
export interface MinersStats {
  total_blocks: number
  miners:       MinerItem[]
}

/** A single entry from the rich list */
export interface RichListItem {
  rank:       number
  address:    string
  balance:    string
  utxo_count: number
  /** Percentage of total supply (0–100) */
  share:      number
}

/** Response from GET /richlist */
export interface RichListResponse {
  total:        number
  page:         number
  pages:        number
  total_supply: string
  addresses:    RichListItem[]
}

/** Result of GET /search/:query — identifies what the query refers to */
export interface SearchResult {
  /** Resource type identified */
  type: 'block' | 'tx' | 'address'
  /** The canonical identifier (height as string for blocks, hex for others) */
  id:   string
}

/** A single entry in a batch address query response */
export interface BatchAddressItem {
  address:     string
  found:       boolean
  balance:     string
  balance_raw: string
  utxo_count:  number
  tx_count:    number
  first_seen:  number | null
  last_seen:   number | null
}

/** Response from POST /addresses/batch */
export interface BatchAddressesResponse {
  count:     number
  addresses: BatchAddressItem[]
}

/** UTXO item with confirmation status from GET /address/:addr/utxos */
export interface UtxoItemRest {
  tx_id:        string
  output_index: number
  /** Amount in exfers (base units) */
  value:        number
  height:       number | null
  is_coinbase:  boolean
  /** False for mempool UTXOs not yet confirmed */
  confirmed:    boolean
}

/** Response from GET /address/:addr/utxos */
export interface UtxosResponse {
  address:       string
  tip_height:    number
  pending_count: number
  utxos:         UtxoItemRest[]
}

// ── REST client ───────────────────────────────────────────────────────────────

/**
 * Lightweight REST client for exchange integrations.
 * Targets the Exfer REST API at api.exfer.dev.
 */
export class ExferRestClient {
  readonly apiUrl: string

  constructor(apiUrl = 'https://api.exfer.dev') {
    this.apiUrl = apiUrl.replace(/\/$/, '')
  }

  private async get<T>(path: string): Promise<T | null>
  private async get<T>(path: string, required: true): Promise<T>
  private async get<T>(path: string, required = false): Promise<T | null> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      signal: AbortSignal.timeout(15_000),
    })
    if (res.status === 404 && !required) return null
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`API ${res.status}: ${body || path}`)
    }
    return res.json() as Promise<T>
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`API ${res.status}: ${text || path}`)
    }
    return res.json() as Promise<T>
  }

  // ── Stats ────────────────────────────────────────────────────────────────────

  /** Current chain tip height (lightweight — use getNetworkStats for full data) */
  async getTipHeight(): Promise<number> {
    const stats = await this.get<ApiStats>('/stats', true)
    return stats.tip_height
  }

  /**
   * Full network statistics: block height, supply, average block time, hash rate, etc.
   */
  async getNetworkStats(): Promise<NetworkStats> {
    return this.get<NetworkStats>('/stats', true)
  }

  /**
   * Hash rate history chart data.
   * @param period - '1h' | '6h' | '24h' | '7d' | '30d' | 'all'  (default: '24h')
   */
  async getHashrateHistory(period = '24h'): Promise<HashrateHistory> {
    return this.get<HashrateHistory>(`/stats/hashrate?period=${period}`, true)
  }

  /**
   * Block time history chart data.
   * @param period - '1h' | '6h' | '24h' | '7d' | '30d' | 'all'  (default: '24h')
   */
  async getBlockTimeHistory(period = '24h'): Promise<BlockTimeHistory> {
    return this.get<BlockTimeHistory>(`/stats/blocktime?period=${period}`, true)
  }

  /**
   * Daily block and transaction count chart data.
   * @param period - '7d' | '14d' | '30d' | '90d'  (default: '30d')
   */
  async getDailyStats(period = '30d'): Promise<DailyStats> {
    return this.get<DailyStats>(`/stats/daily?period=${period}`, true)
  }

  /**
   * Miner block distribution (pie chart data).
   * @param period - '24h' | '7d'  (default: '24h')
   */
  async getMiners(period = '24h'): Promise<MinersStats> {
    return this.get<MinersStats>(`/stats/miners?period=${period}`, true)
  }

  // ── Blocks ────────────────────────────────────────────────────────────────────

  /**
   * Paginated block list, ordered by height descending.
   *
   * @param page  - Page number (default 1)
   * @param limit - Items per page (default 20, max 50)
   */
  async getBlocks(page = 1, limit = 20): Promise<BlocksResponse> {
    return this.get<BlocksResponse>(`/blocks?page=${page}&limit=${limit}`, true)
  }

  // ── Whales ────────────────────────────────────────────────────────────────────

  /**
   * Get recent large-value ("whale") transactions.
   *
   * @param page  - Page number (default 1)
   * @param limit - Items per page (default 100, max 1000)
   */
  async getWhales(page = 1, limit = 100): Promise<WhalesResponse> {
    return this.get<WhalesResponse>(`/whales?page=${page}&limit=${limit}`, true)
  }

  // ── Block detail ──────────────────────────────────────────────────────────────

  /**
   * Get enriched block detail from the REST API.
   * Returns more fields than RPC get_block: size, miner address, and reward.
   *
   * @param id - Block hash (hex) or height as a string
   */
  async getBlockDetail(id: string): Promise<BlockDetail> {
    return this.get<BlockDetail>(`/block/${id}`, true)
  }

  // ── Transaction detail ────────────────────────────────────────────────────────

  /**
   * Get enriched transaction detail from the REST API.
   * Returns more fields than RPC get_transaction: fee, total amounts, size, coinbase flag.
   *
   * @param txId - Transaction ID (64-char hex)
   */
  async getTxDetail(txId: string): Promise<TxDetail> {
    return this.get<TxDetail>(`/tx/${txId}`, true)
  }

  // ── Fee suggestions ─────────────────────────────────────────────────────────

  /**
   * Get network fee suggestions (min / average / fast tiers).
   * Values are human-readable EXFER strings; use parseExfer() to convert.
   *
   * @example
   * const fees = await client.getFeeSuggestions()
   * const fastFee = parseExfer(fees.fast)  // bigint in exfers
   */
  async getFeeSuggestions(): Promise<FeeSuggestions> {
    return this.get<FeeSuggestions>('/stats/fees', true)
  }

  // ── Mempool ─────────────────────────────────────────────────────────────────

  /**
   * Get pending (unconfirmed) transactions for an address.
   * Useful for showing real-time balance including unconfirmed activity.
   *
   * @param address - 64-char hex address
   */
  async getMempool(address: string): Promise<MempoolData> {
    return this.get<MempoolData>(`/address/${address}/mempool`, true)
  }

  // ── Address info ────────────────────────────────────────────────────────────

  /**
   * Get full address information: balance, UTXO count, tx count, and recent activity.
   *
   * @param address - 64-char hex address
   * @param page    - Activity page (default 1)
   * @param limit   - Activity items per page (default 10, max 100)
   */
  async getAddressInfo(address: string, page = 1, limit = 10): Promise<AddressInfo> {
    return this.get<AddressInfo>(`/address/${address}?page=${page}&limit=${limit}`, true)
  }

  // ── Deposit monitoring ──────────────────────────────────────────────────────

  /**
   * Return all confirmed deposits to `address` at height >= `fromHeight`.
   * Single API call — uses the dedicated deposits endpoint on the server.
   *
   * @param limit Max deposits to return per call (default 200, max 1000).
   *              If your address might receive >1000 deposits between polls,
   *              increase polling frequency or use a smaller fromHeight window.
   */
  async getDeposits(
    address: string,
    fromHeight: number,
    limit = 200,
  ): Promise<Deposit[]> {
    const rows = await this.get<ApiDeposit[]>(
      `/address/${address}/deposits?from_height=${fromHeight}&limit=${limit}`,
      true,
    )
    return rows.map(r => ({
      txId:            r.tx_id,
      blockHeight:     r.block_height,
      timestamp:       r.timestamp,
      amount:          BigInt(r.value_raw),
      amountFormatted: r.value,
    }))
  }

  // ── Confirmations ───────────────────────────────────────────────────────────

  /**
   * Return confirmation count for a transaction.
   * Returns 0 if not yet confirmed. Throws if the API is unreachable.
   */
  async getConfirmations(txId: string): Promise<number> {
    const [tx, tip] = await Promise.all([
      this.get<ApiTx>(`/tx/${txId}`),
      this.getTipHeight(),
    ])
    if (!tx || tx.block_height === undefined) return 0
    return tip - tx.block_height + 1
  }

  // ── Batch balances ──────────────────────────────────────────────────────────

  /**
   * Fetch balances for multiple addresses in parallel.
   * Returns a map of address → balance in exfers (base units).
   * Addresses that are not found or have no activity return 0n.
   */
  async batchBalances(addresses: string[]): Promise<BalanceMap> {
    const results = await Promise.allSettled(
      addresses.map(addr =>
        this.get<ApiAddressBalance>(`/address/${addr}`)
          .then(r => ({ addr, raw: r?.balance_raw ?? '0' }))
      ),
    )

    const map: BalanceMap = {}
    for (let i = 0; i < addresses.length; i++) {
      const r = results[i]
      map[addresses[i]] = r.status === 'fulfilled' ? BigInt(r.value.raw) : 0n
    }
    return map
  }

  // ── Batch addresses ─────────────────────────────────────────────────────────

  /**
   * Batch query up to 20 addresses in a single request.
   * Returns full info per address including found status, balance, and timestamps.
   * Uses POST /addresses/batch.
   *
   * @param addresses - Array of 64-char hex addresses (max 20, auto-deduplicated)
   */
  async batchAddresses(addresses: string[]): Promise<BatchAddressesResponse> {
    return this.post<BatchAddressesResponse>('/addresses/batch', { addresses })
  }

  // ── Address UTXOs (REST) ─────────────────────────────────────────────────────

  /**
   * Get UTXOs for an address via the REST API.
   * Unlike the RPC version, each UTXO includes a `confirmed` flag.
   * Pass `includeMempool=true` to also include unconfirmed incoming UTXOs.
   *
   * @param address        - 64-char hex address
   * @param includeMempool - Append pending UTXOs (default false)
   */
  async getAddressUtxosRest(address: string, includeMempool = false): Promise<UtxosResponse> {
    const q = includeMempool ? '?mempool=1' : ''
    return this.get<UtxosResponse>(`/address/${address}/utxos${q}`, true)
  }

  // ── Rich list ───────────────────────────────────────────────────────────────

  /**
   * Get the rich list (addresses sorted by balance, highest first).
   *
   * @param page  - Page number (default 1)
   * @param limit - Items per page (default 20, max 50)
   */
  async getRichList(page = 1, limit = 20): Promise<RichListResponse> {
    return this.get<RichListResponse>(`/richlist?page=${page}&limit=${limit}`, true)
  }

  // ── Search ──────────────────────────────────────────────────────────────────

  /**
   * Smart search — auto-detects whether the query is a block height, block hash,
   * transaction ID, or address, and returns the resource type + canonical ID.
   *
   * @param query - Block height (number as string), block hash, tx ID, or address
   */
  async search(query: string): Promise<SearchResult> {
    return this.get<SearchResult>(`/search/${encodeURIComponent(query)}`, true)
  }
}

// ── Withdrawal helper ─────────────────────────────────────────────────────────

export interface WithdrawalParams {
  /** Available UTXOs for the sender (from getAddressUtxos or batchBalances) */
  utxos:         Utxo[]
  /** Recipient address — 64-char hex */
  toAddress:     string
  /** Amount to send in exfers (base units) */
  amount:        bigint
  /** Fee in exfers (default: DEFAULT_FEE = 880 exfers = 0.0000088 EXFER) */
  fee?:          bigint
  /** Sender's 32-byte private key seed */
  privateKey:    Uint8Array
  /** Sender's 32-byte Ed25519 public key */
  publicKey:     Uint8Array
  /** Sender's 32-byte address bytes (for change output) */
  senderAddress: Uint8Array
  /** RPC endpoint for broadcast (default: https://rpc.exfer.dev) */
  rpcUrl?:       string
}

export interface WithdrawalResult {
  txId:  string
  txHex: string
  fee:   bigint
}

/**
 * Build, sign, and broadcast a withdrawal transaction.
 *
 * @example
 * const result = await sendWithdrawal({
 *   utxos, toAddress, amount: parseExfer('50'),
 *   privateKey, publicKey, senderAddress,
 * })
 * console.log('broadcast txId:', result.txId)
 */
export async function sendWithdrawal(
  params: WithdrawalParams,
): Promise<WithdrawalResult> {
  const signed: SignedTx = await buildTransaction({
    utxos:         params.utxos,
    toAddress:     params.toAddress,
    amount:        params.amount,
    fee:           params.fee ?? DEFAULT_FEE,
    privateKey:    params.privateKey,
    publicKey:     params.publicKey,
    senderAddress: params.senderAddress,
  })

  const rpc = new ExferRpcClient(params.rpcUrl ?? 'https://rpc.exfer.dev')
  const result = await rpc.sendRawTransaction(signed.txHex)

  const txId = result.tx_id ?? signed.txId
  return { txId, txHex: signed.txHex, fee: signed.fee }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create an ExferRestClient pointed at the public REST endpoint.
 */
export function createRestClient(
  apiUrl = 'https://api.exfer.dev',
): ExferRestClient {
  return new ExferRestClient(apiUrl)
}
