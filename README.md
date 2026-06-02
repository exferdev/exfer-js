# exfer-js

JavaScript / TypeScript SDK for the [Exfer](https://exfer.org) blockchain.

[![npm version](https://img.shields.io/npm/v/exfer-js)](https://www.npmjs.com/package/exfer-js)
[![license](https://img.shields.io/npm/l/exfer-js)](./LICENSE)

## Features

- 🔑 **Key management** — generate wallets, derive from mnemonic, import `.key` files
- 📝 **Transaction building** — single send or batch (up to 200 recipients), auto fee calculation
- 🧮 **Fee estimation** — exact fee from consensus cost formula before sending
- 🌐 **RPC client** — typed JSON-RPC client for Exfer nodes (v1.11.8+)
- 🏦 **REST client** — full coverage of the Explorer REST API
- 🔒 **Browser-safe** — private keys never leave the client
- 📦 **Zero config** — ESM + CJS, full TypeScript types

## Installation

```bash
npm install exfer-js
```

## Quick Start

### Generate a wallet

```typescript
import { createMnemonic, walletFromMnemonic } from 'exfer-js'

const mnemonic = createMnemonic()                  // 24-word BIP39 phrase
const wallet   = await walletFromMnemonic(mnemonic)

console.log(wallet.addressHex)   // 64-char hex Exfer address
console.log(wallet.publicKeyHex) // 64-char hex public key
```

### Import a wallet.key file

```typescript
import { importKeyFile } from 'exfer-js'

const bytes  = new Uint8Array(await file.arrayBuffer())
const wallet = await importKeyFile(bytes, 'your-passphrase')
```

### Send a transaction

```typescript
import { createClient, buildTransaction, parseExfer, formatExfer } from 'exfer-js'

const rpc             = createClient()
const { utxos }       = await rpc.getAddressUtxos(wallet.addressHex)

const tx = await buildTransaction({
  utxos,
  toAddress:     recipientAddress,
  amount:        parseExfer('10'),    // 10 EXFER → 1_000_000_000n exfers
  privateKey:    wallet.privateKey,
  publicKey:     wallet.publicKey,
  senderAddress: wallet.address,
  // fee is optional — defaults to DEFAULT_FEE (880 exfers)
})

const result = await rpc.sendRawTransaction(tx.txHex)
console.log('TxID:', result.tx_id ?? tx.txId)
console.log('Fee: ', formatExfer(tx.fee), 'EXFER')
```

### Batch transaction (up to 200 recipients)

```typescript
import { buildBatchTransaction, estimateFee } from 'exfer-js'

// Preview fee before building
const fee = estimateFee(1, 51)  // 1 input, 50 recipients + 1 change
console.log(`Estimated fee: ${fee} exfers`)

const tx = await buildBatchTransaction({
  utxos,
  recipients: [
    { address: addr1, amount: parseExfer('1.5') },
    { address: addr2, amount: parseExfer('2.0') },
    // up to 200 entries
  ],
  privateKey:    wallet.privateKey,
  publicKey:     wallet.publicKey,
  senderAddress: wallet.address,
  // fee auto-calculated from consensus cost formula when omitted
})

console.log(`Total sent: ${formatExfer(tx.totalAmount!)} EXFER`)
console.log(`Fee: ${formatExfer(tx.fee)} EXFER`)
```

### Query the chain

```typescript
import { createClient, createRestClient } from 'exfer-js'

const rpc  = createClient()         // JSON-RPC: https://rpc.exfer.dev
const rest = createRestClient()     // REST API: https://api.exfer.dev

// Network stats
const stats = await rest.getNetworkStats()
console.log(`Height: ${stats.tip_height}`)
console.log(`Hashrate: ${formatHashrate(stats.avg_hashrate)}`)

// Address info
const info = await rest.getAddressInfo(address)
console.log(`Balance: ${info.balance} EXFER`)

// Transaction detail (with outputs and fee)
const tx = await rest.getTxDetail(txId)
console.log(`Fee: ${tx.fee}, Outputs: ${tx.outputs?.length}`)

// Search anything
const found = await rest.search('550931')   // height, hash, txid, or address
console.log(found.type, found.id)
```

---

## API Reference

### Constants

| Name | Value | Description |
|------|-------|-------------|
| `MIN_FEE` | `88n` | Minimum fee for a standard 1-in 2-out transaction (exfers) |
| `DEFAULT_FEE` | `880n` | Default fee (average tier, exfers) |
| `DUST_THRESHOLD` | `200n` | Minimum output value (exfers) |
| `EXFERS_PER_EXFER` | `100_000_000n` | 1 EXFER in base units |
| `GENESIS_BLOCK_ID` | `string` | Production genesis block hash |

---

### Key Management

| Function | Returns | Description |
|----------|---------|-------------|
| `createMnemonic()` | `string` | Generate a new 24-word BIP39 mnemonic |
| `generateMnemonic()` | `string` | Alias of `createMnemonic` |
| `isValidMnemonic(m)` | `boolean` | Validate a BIP39 mnemonic |
| `walletFromMnemonic(m)` | `Promise<KeyPair>` | Derive key pair from mnemonic |
| `keyPairFromSeed(seed)` | `Promise<KeyPair>` | Derive key pair from 32-byte seed |
| `importKeyFile(bytes, passphrase)` | `Promise<KeyPair>` | Import official `.key` file |
| `sign(message, privateKey)` | `Promise<Uint8Array>` | Ed25519 sign |

**`KeyPair` fields:**

| Field | Type | Description |
|-------|------|-------------|
| `privateKey` | `Uint8Array` | 32-byte private key seed |
| `publicKey` | `Uint8Array` | 32-byte Ed25519 public key |
| `address` | `Uint8Array` | 32-byte address bytes |
| `addressHex` | `string` | 64-char hex address |
| `publicKeyHex` | `string` | 64-char hex public key |

---

### Transactions

| Function | Returns | Description |
|----------|---------|-------------|
| `buildTransaction(params)` | `Promise<SignedTx>` | Build and sign a single transfer |
| `buildBatchTransaction(params)` | `Promise<SignedTx>` | Build and sign a batch transfer (≤200 recipients) |
| `estimateFee(numInputs, numOutputs)` | `bigint` | Exact minimum fee from consensus cost formula |

**`buildTransaction` / `buildBatchTransaction` params:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `utxos` | `Utxo[]` | ✓ | Available UTXOs from the sender |
| `toAddress` | `string` | ✓ (single only) | Recipient address (64-char hex) |
| `recipients` | `BatchRecipient[]` | ✓ (batch only) | Array of `{ address, amount }` |
| `amount` | `bigint` | ✓ (single only) | Amount in exfers |
| `privateKey` | `Uint8Array` | ✓ | 32-byte private key seed |
| `publicKey` | `Uint8Array` | ✓ | 32-byte public key |
| `senderAddress` | `Uint8Array` | ✓ | 32-byte address (receives change) |
| `fee` | `bigint` | optional | Override fee; omit to auto-calculate |

**`SignedTx` fields:**

| Field | Type | Description |
|-------|------|-------------|
| `txHex` | `string` | Signed transaction hex for broadcast |
| `txId` | `string` | Transaction ID (computed locally) |
| `fee` | `bigint` | Actual fee used (exfers) |
| `totalAmount` | `bigint \| undefined` | Sum of recipient amounts (batch only) |

---

### RPC Client (`ExferRpcClient`)

Connects to the Exfer node JSON-RPC endpoint (`https://rpc.exfer.dev`).

```typescript
const rpc = createClient()          // or: new ExferRpcClient(url)
```

| Method | Returns | Description |
|--------|---------|-------------|
| `getBlockHeight()` | `BlockHeight` | Current tip height and block ID |
| `getBlock({ height?, hash? })` | `Block` | Block by height or hash |
| `getTransaction(hash)` | `Transaction` | Transaction by ID |
| `getBalance(address)` | `AddressBalance` | Address balance (raw) |
| `getAddressUtxos(address)` | `AddressUtxos` | UTXOs for an address |
| `sendRawTransaction(txHex)` | `BroadcastResult` | Broadcast signed transaction |
| `getOutputSpentBy(txId, outputIndex)` | `OutputSpentBy` | Which tx spent this output (v1.11.8+) |
| `tryParseHtlc(script)` | `HtlcInfo` | Parse script as HTLC (v1.11.8+) |

---

### REST Client (`ExferRestClient`)

Full coverage of the Explorer REST API (`https://api.exfer.dev`).

```typescript
const rest = createRestClient()     // or: new ExferRestClient(url)
```

#### Stats

| Method | Returns | Description |
|--------|---------|-------------|
| `getTipHeight()` | `number` | Current block height |
| `getNetworkStats()` | `NetworkStats` | Full stats: height, supply, hashrate, block time |
| `getFeeSuggestions()` | `FeeSuggestions` | Min / average / fast fee tiers |
| `getHashrateHistory(period?)` | `HashrateHistory` | Hashrate chart data (`1h`/`6h`/`24h`/`7d`/`30d`/`all`) |
| `getBlockTimeHistory(period?)` | `BlockTimeHistory` | Block time chart data |
| `getDailyStats(period?)` | `DailyStats` | Daily block/tx count (`7d`/`14d`/`30d`/`90d`) |
| `getMiners(period?)` | `MinersStats` | Miner distribution (`24h`/`7d`) |

#### Blocks

| Method | Returns | Description |
|--------|---------|-------------|
| `getBlocks(page?, limit?)` | `BlocksResponse` | Paginated block list |
| `getBlockDetail(id)` | `BlockDetail` | Block by height or hash (with transactions[]) |

#### Transactions

| Method | Returns | Description |
|--------|---------|-------------|
| `getTxDetail(txId)` | `TxDetail` | Transaction with outputs, fee, total amounts |
| `getConfirmations(txId)` | `number` | Confirmation count |

#### Address

| Method | Returns | Description |
|--------|---------|-------------|
| `getAddressInfo(address, page?, limit?)` | `AddressInfo` | Balance, counts, activity |
| `getAddressUtxosRest(address, mempool?)` | `UtxosResponse` | UTXOs with `confirmed` flag |
| `getMempool(address)` | `MempoolData` | Pending (unconfirmed) transactions |
| `getDeposits(address, fromHeight, limit?)` | `Deposit[]` | Confirmed deposits since height |
| `batchAddresses(addresses[])` | `BatchAddressesResponse` | Up to 20 addresses in one request |
| `batchBalances(addresses[])` | `BalanceMap` | `address → bigint` balance map |

#### Rich List & Whales

| Method | Returns | Description |
|--------|---------|-------------|
| `getRichList(page?, limit?)` | `RichListResponse` | Addresses sorted by balance |
| `getWhales(page?, limit?)` | `WhalesResponse` | Large transactions (≥10,000 EXFER, last 24h) |

#### Search

| Method | Returns | Description |
|--------|---------|-------------|
| `search(query)` | `SearchResult` | Auto-detect type: block / tx / address |

---

### Exchange Integration

```typescript
import { createRestClient, sendWithdrawal, parseExfer } from 'exfer-js'

const api = createRestClient()

// Monitor deposits since last processed height
const deposits = await api.getDeposits(hotWalletAddress, fromHeight)
for (const d of deposits) {
  console.log(d.txId, d.amountFormatted, 'EXFER at block', d.blockHeight)
}

// Batch balance check across many addresses
const balances = await api.batchBalances([addr1, addr2, addr3])
console.log(balances[addr1])  // bigint in exfers

// Full batch with metadata
const batch = await api.batchAddresses([addr1, addr2])
for (const item of batch.addresses) {
  console.log(item.address, item.found, item.balance)
}

// Withdraw: build + sign + broadcast
const result = await sendWithdrawal({
  utxos,
  toAddress:     recipientAddress,
  amount:        parseExfer('50'),
  privateKey:    wallet.privateKey,
  publicKey:     wallet.publicKey,
  senderAddress: wallet.address,
})
console.log('txId:', result.txId, 'fee:', result.fee)
```

---

### Utilities

| Function | Description |
|----------|-------------|
| `parseExfer(string)` | Parse EXFER string → base units bigint. `"1"` → `100_000_000n`, `"1.5"` → `150_000_000n`. Strips commas and `EXFER` suffix. |
| `formatExfer(exfers)` | Format base units (bigint/number/string) → human-readable EXFER string |
| `shortAddr(address)` | Shorten address for display: `"abcd1234…efgh5678"` |
| `shortHash(hash)` | Shorten block hash / tx ID for display |
| `formatHashrate(hr)` | Format H/s number: `1_500_000` → `"1.50 MH/s"` |
| `timeAgo(timestamp)` | Unix timestamp → `"5m ago"`, `"2h ago"`, `"just now"` |
| `estimateBlockReward(height)` | Estimated block reward in EXFER at a given height |
| `bytesToHex(bytes)` | `Uint8Array` → lowercase hex string |
| `hexToBytes(hex)` | Hex string → `Uint8Array` (throws on invalid characters) |
| `domainHash(sep, data)` | Exfer domain hash: `SHA-256(len(sep) ‖ sep ‖ data)` |
| `concat(...arrays)` | Concatenate `Uint8Array` values |

---

## Public Endpoints

| Client | Default URL | Purpose |
|--------|-------------|---------|
| `createClient()` | `https://rpc.exfer.dev` | JSON-RPC: UTXOs, broadcast |
| `createRestClient()` | `https://api.exfer.dev` | REST: all explorer data |

## License

MIT © [exferdev](https://github.com/exferdev)
