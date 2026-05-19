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

  // ── Tip height ──────────────────────────────────────────────────────────────

  /** Current chain tip height */
  async getTipHeight(): Promise<number> {
    const stats = await this.get<ApiStats>('/stats', true)
    return stats.tip_height
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
}

// ── Withdrawal helper ─────────────────────────────────────────────────────────

export interface WithdrawalParams {
  /** Available UTXOs for the sender (from getAddressUtxos or batchBalances) */
  utxos:         Utxo[]
  /** Recipient address — 64-char hex */
  toAddress:     string
  /** Amount to send in exfers (base units) */
  amount:        bigint
  /** Fee in exfers (default: 0.001 EXFER = 100_000) */
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
