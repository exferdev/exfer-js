import { domainHash, concat, bytesToHex, hexToBytes, u16LE, u32LE, u64LE } from './utils.js'
import { sign } from './crypto.js'
import { GENESIS_BLOCK_ID, DEFAULT_FEE, DUST_THRESHOLD } from './constants.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Utxo {
  tx_id:        string
  output_index: number
  value:        number  // base units (exfers)
}

export interface TxOutput {
  address: string  // 64-char hex
  value:   bigint  // base units (exfers)
}

export interface UnsignedTx {
  txHeader:    Uint8Array
  txBody:      Uint8Array
  selectedUtxos: Utxo[]
  totalInput:  bigint
  change:      bigint
  fee:         bigint
}

export interface SignedTx {
  txHex: string
  txId:  string
  fee:   bigint
}

export interface BatchRecipient {
  /** Recipient address as 64-char hex string */
  address: string
  /** Amount in base units (exfers) */
  amount: bigint
}

// ── Transaction builder ───────────────────────────────────────────────────────

function serializeOutput(value: bigint, script: Uint8Array): Uint8Array {
  return concat(
    u64LE(value),
    u16LE(script.length), script,
    new Uint8Array([0x00, 0x00]),   // has_datum=false, has_datum_hash=false
  )
}

function selectUtxos(utxos: Utxo[], need: bigint): Utxo[] {
  let total = 0n
  const selected: Utxo[] = []
  for (const u of utxos) {
    selected.push(u)
    total += BigInt(u.value)
    if (total >= need) return selected
  }
  throw new Error(
    `Insufficient balance: need ${need} exfers, have ${total} exfers`
  )
}

/**
 * Build and sign an Exfer transfer transaction.
 *
 * @param params.utxos         - Available UTXOs from the sender
 * @param params.toAddress     - Recipient address (64-char hex)
 * @param params.amount        - Amount to send in exfers (base units)
 * @param params.fee           - Transaction fee in exfers (default 0.001 EXFER)
 * @param params.privateKey    - Sender's 32-byte private key seed
 * @param params.publicKey     - Sender's 32-byte public key
 * @param params.senderAddress - Sender's 32-byte address (for change output)
 */
export async function buildTransaction(params: {
  utxos:         Utxo[]
  toAddress:     string
  amount:        bigint
  fee?:          bigint
  privateKey:    Uint8Array
  publicKey:     Uint8Array
  senderAddress: Uint8Array
}): Promise<SignedTx> {
  const {
    utxos, toAddress, amount, privateKey, publicKey, senderAddress,
    fee = DEFAULT_FEE,
  } = params

  const recipientScript = hexToBytes(toAddress)
  if (recipientScript.length !== 32)
    throw new Error('Recipient address must be a 64-character hex string (32 bytes)')

  // 1. Select UTXOs
  const need     = amount + fee
  const selected = selectUtxos(utxos, need)
  const total    = selected.reduce((s, u) => s + BigInt(u.value), 0n)
  const change   = total - need
  const hasChange = change >= DUST_THRESHOLD
  const outCount  = hasChange ? 2 : 1

  // 2. tx_header: input_count(u16LE) || output_count(u16LE)
  const txHeader = concat(u16LE(selected.length), u16LE(outCount))

  // 3. tx_body: inputs || outputs
  const inputs = concat(
    ...selected.map(u => concat(hexToBytes(u.tx_id), u32LE(u.output_index)))
  )
  const out0    = serializeOutput(amount, recipientScript)
  const outputs = hasChange
    ? concat(out0, serializeOutput(change, senderAddress))
    : out0

  const txBody = concat(inputs, outputs)

  // 4. Sign: "EXFER-SIG" || genesis_id || tx_header || tx_body
  const sigMsg = concat(
    new TextEncoder().encode('EXFER-SIG'),
    hexToBytes(GENESIS_BLOCK_ID),
    txHeader,
    txBody,
  )
  const signature = await sign(sigMsg, privateKey)

  // 5. Witnesses: VarBytes(pubkey || sig) || has_redeemer=0x00
  const wData = concat(publicKey, signature)   // 96 bytes
  const witness = concat(u16LE(wData.length), wData, new Uint8Array([0x00]))
  const witnesses = concat(...Array(selected.length).fill(witness))

  // 6. Full transaction
  const fullTx = concat(txHeader, txBody, witnesses)

  // 7. TxId = domain_hash("EXFER-TX", tx_header || tx_body)
  const txId = domainHash('EXFER-TX', concat(txHeader, txBody))

  return {
    txHex: bytesToHex(fullTx),
    txId:  bytesToHex(txId),
    fee,
  }
}

// ── Fee estimation ────────────────────────────────────────────────────────────

// Each output: 8 (value) + 2 (script_len) + 32 (script) + 1 (has_datum) + 1 (has_datum_hash) = 44 bytes
const OUTPUT_BYTES = 44
// Each input: 32 (tx_id) + 4 (output_index) = 36 bytes
const INPUT_BYTES  = 36
// Per-input witness: 2 (len) + 32 (pubkey) + 64 (sig) + 1 (has_redeemer) = 99 bytes
const WITNESS_BYTES = 99
// sig_msg prefix: "EXFER-SIG"(9) + genesis(32) = 41 bytes; tx_header = 4 bytes
const SIG_PREFIX_BYTES = 9 + 32 + 4

// Exfer consensus cost constants (from cost.rs)
const PHASE1_SCRIPT_EVAL = 5000
const HASH_CYCLE_COST    = 8
const CYCLE_BYTES        = 64
const UTXO_LOOKUP        = 100
const UTXO_CREATE        = 100
const SMT_DELETE         = 500
const SMT_INSERT         = 500
const MIN_FEE_DIVISOR    = 100

function estimateFee(numInputs: number, numOutputs: number): bigint {
  const txBodyBytes  = numInputs * INPUT_BYTES + numOutputs * OUTPUT_BYTES
  const sigMsgBytes  = SIG_PREFIX_BYTES + txBodyBytes
  const txBytes      = 4 + txBodyBytes + numInputs * WITNESS_BYTES

  const scriptEval   = numInputs * (PHASE1_SCRIPT_EVAL + Math.ceil(sigMsgBytes / CYCLE_BYTES) * HASH_CYCLE_COST)
  const witnessDeser = Math.ceil(WITNESS_BYTES / CYCLE_BYTES) * 2 * numInputs   // ceil(99/64)*2 = 4 per input
  const txDeser      = Math.ceil(txBytes / CYCLE_BYTES)
  const utxoIo       = numInputs * UTXO_LOOKUP + numOutputs * UTXO_CREATE
  const smt          = numInputs * SMT_DELETE + numOutputs * SMT_INSERT

  const txCost = scriptEval + witnessDeser + txDeser + utxoIo + smt
  return BigInt(Math.ceil(txCost / MIN_FEE_DIVISOR))
}

// ── Batch transaction builder ─────────────────────────────────────────────────

/**
 * Build and sign an Exfer batch transfer transaction (up to 200 recipients).
 *
 * When `fee` is omitted the minimum fee is computed from the Exfer consensus
 * cost formula (cost.rs).  Two iterations are used so the fee accounts for
 * the actual UTXO count selected.
 *
 * @param params.utxos         - Available UTXOs from the sender (sorted largest-first recommended)
 * @param params.recipients    - Up to 200 {address, amount} pairs
 * @param params.fee           - Override fee in exfers; omit to auto-calculate
 * @param params.privateKey    - Sender's 32-byte private key seed
 * @param params.publicKey     - Sender's 32-byte public key
 * @param params.senderAddress - Sender's 32-byte address (for change output)
 */
export async function buildBatchTransaction(params: {
  utxos:         Utxo[]
  recipients:    BatchRecipient[]
  fee?:          bigint
  privateKey:    Uint8Array
  publicKey:     Uint8Array
  senderAddress: Uint8Array
}): Promise<SignedTx> {
  const { utxos, recipients, privateKey, publicKey, senderAddress } = params

  if (recipients.length === 0)   throw new Error('At least one recipient required')
  if (recipients.length > 200)   throw new Error('Maximum 200 recipients per transaction')

  const recipientScripts = recipients.map((r, i) => {
    const s = hexToBytes(r.address)
    if (s.length !== 32)
      throw new Error(`Recipient[${i}] address must be a 64-character hex string`)
    return s
  })

  const totalOut = recipients.reduce((s, r) => s + r.amount, 0n)

  // ── UTXO selection with fee estimation ────────────────────────────────────
  // Pass 1: rough estimate using 1 input to get a fee in the right ballpark
  let fee = params.fee ?? estimateFee(1, recipients.length + 1)

  let selected = selectUtxos(utxos, totalOut + fee)
  let inputTotal = selected.reduce((s, u) => s + BigInt(u.value), 0n)
  let change     = inputTotal - totalOut - fee
  let hasChange  = change >= DUST_THRESHOLD

  // Pass 2: recompute with actual input count (skip if fee was provided)
  if (params.fee === undefined) {
    const refinedFee = estimateFee(selected.length, hasChange ? recipients.length + 1 : recipients.length)
    if (refinedFee !== fee) {
      fee       = refinedFee
      selected  = selectUtxos(utxos, totalOut + fee)
      inputTotal = selected.reduce((s, u) => s + BigInt(u.value), 0n)
      change     = inputTotal - totalOut - fee
      hasChange  = change >= DUST_THRESHOLD
    }
  }

  const outCount = hasChange ? recipients.length + 1 : recipients.length

  // ── Serialise ─────────────────────────────────────────────────────────────
  const txHeader = concat(u16LE(selected.length), u16LE(outCount))

  const inputs = concat(
    ...selected.map(u => concat(hexToBytes(u.tx_id), u32LE(u.output_index)))
  )
  const recipientOutputs = recipients.map((r, i) => serializeOutput(r.amount, recipientScripts[i]))
  const outputs = hasChange
    ? concat(...recipientOutputs, serializeOutput(change, senderAddress))
    : concat(...recipientOutputs)

  const txBody = concat(inputs, outputs)

  // ── Sign ──────────────────────────────────────────────────────────────────
  const sigMsg = concat(
    new TextEncoder().encode('EXFER-SIG'),
    hexToBytes(GENESIS_BLOCK_ID),
    txHeader,
    txBody,
  )
  const signature = await sign(sigMsg, privateKey)

  const wData    = concat(publicKey, signature)   // 96 bytes
  const witness  = concat(u16LE(wData.length), wData, new Uint8Array([0x00]))
  const witnesses = concat(...Array(selected.length).fill(witness))

  const fullTx = concat(txHeader, txBody, witnesses)
  const txId   = domainHash('EXFER-TX', concat(txHeader, txBody))

  return {
    txHex: bytesToHex(fullTx),
    txId:  bytesToHex(txId),
    fee,
  }
}
