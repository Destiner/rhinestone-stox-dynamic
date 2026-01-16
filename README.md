# EIP-7702 + Dynamic + Rhinestone Bug Reproduction

Minimal browser-based repro using **real Dynamic wallet** and **real Rhinestone SDK**.

## Setup

```bash
cp .env.example .env
# Fill in VITE_RHINESTONE_API_KEY and VITE_DYNAMIC_ENVIRONMENT_ID

npm install
npm run dev
```

Open http://localhost:5173

## Steps

1. Connect with Dynamic embedded wallet
2. Click "Run EIP-7702 Test"
3. Watch the logs

## Expected Failure

At **Step 10**, `signAuthorizations()` should fail with:
```
Account type "json-rpc" is not supported
```

## What the test does

1. Gets provider from Dynamic wallet
2. Creates viem WalletClient with `custom(provider)`
3. Converts to Rhinestone account via `walletClientToAccount()`
4. Creates Rhinestone account with `accountType: '7702'`
5. Prepares transaction with `feeAsset: 'USDC'`
6. **Calls `signAuthorizations()`** - THIS FAILS for JSON-RPC accounts
7. Tries manual workaround via `walletClient.signAuthorization()`

## Questions

**For Rhinestone:**
- Can you expose the delegate contract address for manual authorization signing?
- Does `signAuthorizations()` support a fallback for JSON-RPC accounts?

**For Dynamic:**
- Does the embedded wallet support `wallet_signAuthorization` RPC method?
- Is there another way to sign EIP-7702 authorizations?
