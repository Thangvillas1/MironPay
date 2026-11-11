# MironPaymentRouter: Deployment (Arc Testnet)

Revision 2 of `contracts/MironPaymentRouter.sol` (the version reviewed in `contracts/AUDIT.md`), deployed unchanged. Testnet only.

## Deployment

| Item | Value |
|---|---|
| Network | Arc Testnet, chainId 5042002 |
| **Router address** | `0x5717F0965Bb12b7B05BD914D8C9530e80f8BeD1a` |
| **Deployment tx** | `0x1be55d3c21a303d7f27c4c3f4a046596ca5f7384e08d8969b564a2e94ee98bc3` |
| **Block number** | 71910573 |
| **Deployer address** | `0x5B12Ce46C7194aD57d143bC22847224047b1Ef42` (the smart-account deployer wallet, sender of the user operation) |
| Constructor argument | `feeRecipient_ = 0x7A3Bc75Bbc8D7022897a11632F7a7B90567a004E` |
| Explorer | https://explorer.testnet.arc.io/address/0x5717F0965Bb12b7B05BD914D8C9530e80f8BeD1a |
| Source verification | Verified on the explorer ("fully verified"), see below |
| Gas used by the bundle | 1,985,311 (the deployment is paid by a paymaster, ~0.0526 USDC at the effective gas price of 25 gwei) |

How the transaction was sent (so it is not confusing on the explorer): the deployer wallet is an ERC-4337 smart account. The tx was submitted by a bundler (`0x3Eff9169af98186De2F3b07cCAE08D35e16B8573`) to the EntryPoint (`0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789`), and the explorer lists the contract's creator as the CREATE2 factory `0xa3039A54856ed74B5AEc999EeF3fc954Ab010Cf6`. The router address is therefore not derived from the bundler's nonce.

The deployer wallet is a shared testnet wallet, **not yours**. It holds no permissions on the router: the router has no owner. The only privileged role is `feeRecipient` (set to your address above). The constructor emitted `FeeRecipientChanged(0x0, 0x7A3B…004E)`.

## Compiler and build settings (exact)

| Setting | Value |
|---|---|
| Compiler | solc `0.8.28+commit.7893614a` |
| Optimizer | enabled, 200 runs |
| EVM version | cancun |
| via_ir | off |
| Metadata bytecode hash | ipfs (default) |
| Libraries | none (OpenZeppelin `ReentrancyGuard`, `SafeERC20`, `Math`, `SafeCast`, v5.6.1, all inlined) |
| Runtime code size | 8,090 bytes |

The code on chain was compared byte for byte with the build artifact: identical.

## Source verification

Verified with Foundry against the explorer (`forge verify-contract --verifier blockscout --verifier-url https://explorer.testnet.arc.io/api/ …`) with the constructor arguments `0x0000000000000000000000007a3bc75bbc8d7022897a11632f7a7b90567a004e`. Explorer API reports `is_verified: true`, `is_fully_verified: true`, compiler v0.8.28, optimizer 200 runs, EVM cancun.

## ABI

Full ABI (40 entries) saved to `contracts/MironPaymentRouter.abi.json`. It covers the router functions (`pay`, `settle`, `refundExcess`, `getOrderStatus`, `getOrderStatuses`, `computeDepositAddress`, `orderKey`, fee-recipient rotation, constants, `orders`), events and custom errors.

## Read-only checks against the live address

All performed with `eth_call`; no transaction was sent beyond the deployment.

| # | Check | Result | Expected |
|---|---|---|---|
| 1 | `feeRecipient()` | `0x7A3Bc75Bbc8D7022897a11632F7a7B90567a004E` | match |
| 2 | `FEE_BPS()` | `10` | match |
| 3 | `pendingFeeRecipient()` | `0x0000000000000000000000000000000000000000` | match |
| 4 | `computeDepositAddress(order)` | `0xC54e8CDFC816631461c4e638c984De955b5729Ff` | n/a |
| 4 | `orderKey(order)` | `0x7c63320fb00963a8c4b3211b928cea6d6bb4b6b67d67ead6cf67aea51e07c468` | n/a |
| 5 | `getOrderStatus(order)` | status `0` (NONE), credited `0`, pendingInBox `0`, excess `0`, late `false`, expired `false`, depositAddress `0xC54e8CDFC816631461c4e638c984De955b5729Ff` | NONE, empty box |
| 6 | `keccak256(type(DepositBox).creationCode)` | `0x1bc85e97b2c1d9c94a362038fd8c19334a0cda15488cb5d3d11c198501d5afd7` | see below |

Extra constants read: `BPS() = 10000`, `USDC() = 0x3600000000000000000000000000000000000000`, `NATIVE_SCALE() = 1000000000000`.

The order used for checks 4 and 5:

```
orderId  = 0x0000000000000000000000000000000000000000000000000000000000000001
merchant = 0x7A3Bc75Bbc8D7022897a11632F7a7B90567a004E
token    = 0x3600000000000000000000000000000000000000
amount   = 500000
expiry   = 0
```

### Computing deposit addresses off-chain

The router does not expose the creation-code hash as a function, so check 6 was computed from the build artifact (the `DepositBox` creation bytecode, 1,222 bytes, keccak256 as above). It was then **confirmed against the chain**: computing the CREATE2 address off-chain with that hash gives `0xC54e8CDFC816631461c4e638c984De955b5729Ff`, exactly what the live `computeDepositAddress` returned.

```
orderKey = keccak256(abi.encode(orderId, merchant, token, amount, expiry))   // abi.encode of the 5 fields, expiry as uint64 padded to 32 bytes
salt     = orderKey
address  = last 20 bytes of keccak256(0xff ++ router ++ salt ++ 0x1bc85e97b2c1d9c94a362038fd8c19334a0cda15488cb5d3d11c198501d5afd7)
router   = 0x5717F0965Bb12b7B05BD914D8C9530e80f8BeD1a
```

This hash is valid only for this exact build (solc 0.8.28, optimizer 200, cancun, metadata hash ipfs, OpenZeppelin 5.6.1). Rebuilding with different settings or a changed `DepositBox` changes it and every deposit address.

## Not done in this turn

No `pay`, `settle`, refund or any other transaction was sent. The behaviours listed as UNVERIFIED in `AUDIT.md` (dust forwarding on the live chain, real USDC blocklist behaviour) remain unverified; a small real payment and settle would confirm them.
