# exfer-js

JavaScript / TypeScript SDK for the [Exfer](https://github.com/ahuman-exfer/exfer) blockchain.

[![npm version](https://img.shields.io/npm/v/exfer-js)](https://www.npmjs.com/package/exfer-js)
[![license](https://img.shields.io/npm/l/exfer-js)](./LICENSE)

## Features

- 🔑 **Key management** — generate key pairs, derive from mnemonic, import `.key` files
- 📝 **Transaction building** — construct and sign UTXO transactions
- 🌐 **RPC client** — typed JSON-RPC client for Exfer nodes
- 🏦 **Exchange client** — deposit monitoring, confirmations, batch balances, withdrawals
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

const mnemonic = createMnemonic()          // 24-word BIP39 phrase
const wallet   = await walletFromMnemonic(mnemonic)

console.log(wallet.addressHex)   // your Exfer address (64-char hex)
console.log(wallet.publicKeyHex) // your public key
```

### Import an official wallet.key file

```typescript
import { importKeyFile } from 'exfer-js'

const bytes  = new Uint8Array(await file.arrayBuffer())
const wallet = await importKeyFile(bytes, 'your-passphrase')

console.log(wallet.addressHex)
```

### Query the chain

```typescript
import { createClient } from 'exfer-js'

const client = createClient()  // defaults to https://rpc.exfer.dev

const tip    = await client.getBlockHeight()
const utxos  = await client.getAddressUtxos(wallet.addressHex)
const balance = await client.getBalance(wallet.addressHex)

console.log(`Height: ${tip.height}`)
console.log(`Balance: ${balance.balance} exfers`)
```

### Send a transaction

```typescript
import { createClient, buildTransaction, parseExfer } from 'exfer-js'

const client = createClient()
const { utxos } = await client.getAddressUtxos(wallet.addressHex)

const tx = await buildTransaction({
  utxos,
  toAddress:     recipientAddress,
  amount:        parseExfer('10'),    // 10 EXFER
  privateKey:    wallet.privateKey,
  publicKey:     wallet.publicKey,
  senderAddress: wallet.address,
})

const result = await client.sendRawTransaction(tx.txHex)
console.log('TxID:', result.tx_id ?? tx.txId)
```

### Format amounts

```typescript
import { formatExfer, parseExfer } from 'exfer-js'

formatExfer(9999999900n)   // "99.999999"
parseExfer('10.5')          // 1050000000n
```

## API Reference

### Key Management

| Function | Description |
|---|---|
| `createMnemonic()` | Generate a new 24-word mnemonic |
| `isValidMnemonic(mnemonic)` | Validate a mnemonic phrase |
| `walletFromMnemonic(mnemonic)` | Derive key pair from mnemonic |
| `keyPairFromSeed(seed)` | Derive key pair from 32-byte seed |
| `importKeyFile(bytes, passphrase)` | Import official `.key` file |
| `sign(message, privateKey)` | Sign with Ed25519 |

### Transactions

| Function | Description |
|---|---|
| `buildTransaction(params)` | Build and sign a transfer transaction |

### RPC Client

| Method | Description |
|---|---|
| `createClient(url?)` | Create an RPC client |
| `client.getBlockHeight()` | Get current chain height |
| `client.getBlock({ height?, hash? })` | Get block details |
| `client.getTransaction(hash)` | Get transaction details |
| `client.getBalance(address)` | Get address balance |
| `client.getAddressUtxos(address)` | Get address UTXOs |
| `client.sendRawTransaction(txHex)` | Broadcast a transaction |

### Exchange Client (`ExferRestClient`)

| Method | Description |
|---|---|
| `createRestClient(url?)` | Create a REST client |
| `client.getDeposits(address, fromHeight, limit?)` | Deposits since a block height |
| `client.getConfirmations(txId)` | Confirmation count for a tx |
| `client.batchBalances(addresses[])` | Balances for multiple addresses |
| `client.getTipHeight()` | Current chain tip height |
| `sendWithdrawal(params)` | Build + sign + broadcast withdrawal |

### Utilities

| Function | Description |
|---|---|
| `formatExfer(exfers)` | Format base units as EXFER string |
| `parseExfer(string)` | Parse EXFER string to base units |
| `estimateBlockReward(height)` | Estimate block reward at height |
| `bytesToHex(bytes)` | Encode bytes to hex |
| `hexToBytes(hex)` | Decode hex to bytes |
| `domainHash(sep, data)` | Exfer domain hash |

### Exchange Integration

```typescript
import { createRestClient, sendWithdrawal, parseExfer } from 'exfer-js'

const api = createRestClient() // defaults to https://api.exfer.dev

// Deposit monitoring — single request, no pagination
const deposits = await api.getDeposits(hotWalletAddress, fromHeight)
// deposits[].amount    → bigint (exfers, exact)
// deposits[].blockHeight → number

// Confirmation count
const confs = await api.getConfirmations(txId)

// Batch balances for multiple hot wallets
const balances = await api.batchBalances([addr1, addr2, addr3])
// balances[addr1] → bigint

// Withdrawal: build + sign + broadcast in one call
const result = await sendWithdrawal({
  utxos,
  toAddress:     recipientAddress,
  amount:        parseExfer('50'),
  privateKey:    wallet.privateKey,
  publicKey:     wallet.publicKey,
  senderAddress: wallet.address,
})
console.log('txId:', result.txId)
```

## Public Endpoints

| Client | Default URL | Use |
|---|---|---|
| `createClient()` | `https://rpc.exfer.dev` | JSON-RPC: UTXOs, broadcast |
| `createRestClient()` | `https://api.exfer.dev` | REST: deposits, confirmations, balances |

## License

MIT © [exferdev](https://github.com/exferdev)
