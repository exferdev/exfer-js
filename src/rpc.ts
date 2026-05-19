// ── Types ─────────────────────────────────────────────────────────────────────

export interface BlockHeight {
  height:   number
  block_id: string
}

export interface Block {
  hash:             string
  height:           number
  timestamp:        number
  tx_count:         number
  transactions:     string[]
  prev_block_id:    string
  difficulty_target: string
  nonce:            number
}

export interface Transaction {
  tx_id:        string
  tx_hex:       string
  in_mempool:   boolean
  block_hash?:  string
  block_height?: number
}

export interface Utxo {
  tx_id:        string
  output_index: number
  value:        number
  height:       number
  is_coinbase:  boolean
}

export interface AddressUtxos {
  address:    string
  tip_height: number
  utxos:      Utxo[]
}

export interface AddressBalance {
  balance: number
}

export interface BroadcastResult {
  tx_id?: string
}

// ── Client ────────────────────────────────────────────────────────────────────

export class ExferRpcClient {
  constructor(private readonly url: string) {}

  private async call<T>(method: string, params: object = {}): Promise<T> {
    const res = await fetch(this.url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ jsonrpc: '2.0', method, params, id: Date.now() }),
      signal:  AbortSignal.timeout(12_000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json() as { result?: T; error?: { message: string } }
    if (data.error) throw new Error(data.error.message ?? 'RPC error')
    return data.result as T
  }

  /** Get the current chain tip height */
  getBlockHeight() {
    return this.call<BlockHeight>('get_block_height')
  }

  /** Get a block by height or hash */
  getBlock(params: { height?: number; hash?: string }) {
    return this.call<Block>('get_block', params)
  }

  /** Get a transaction by ID */
  getTransaction(hash: string) {
    return this.call<Transaction>('get_transaction', { hash })
  }

  /** Get the balance of an address */
  getBalance(address: string) {
    return this.call<AddressBalance>('get_balance', { address })
  }

  /** Get UTXOs for an address (up to 1000) */
  getAddressUtxos(address: string) {
    return this.call<AddressUtxos>('get_address_utxos', { address })
  }

  /** Broadcast a signed raw transaction */
  sendRawTransaction(txHex: string) {
    return this.call<BroadcastResult>('send_raw_transaction', { tx_hex: txHex })
  }
}

/**
 * Create an RPC client pointed at the public Exfer endpoint.
 * @param url - RPC endpoint URL (default: https://rpc.exfer.dev)
 */
export function createClient(url = 'https://rpc.exfer.dev'): ExferRpcClient {
  return new ExferRpcClient(url)
}
