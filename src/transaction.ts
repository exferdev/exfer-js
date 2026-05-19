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
