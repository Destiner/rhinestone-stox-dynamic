import { useState } from 'react';
import { useDynamicContext, DynamicWidget } from '@dynamic-labs/sdk-react-core';
import { createWalletClient, custom, type Address, type Hex } from 'viem';
import { base } from 'viem/chains';
import { RhinestoneSDK, walletClientToAccount } from '@rhinestone/sdk';

const RHINESTONE_API_KEY = import.meta.env.VITE_RHINESTONE_API_KEY;

type LogEntry = { time: string; level: 'info' | 'error' | 'success'; msg: string };

export default function App() {
  const { primaryWallet, user } = useDynamicContext();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);

  const log = (level: LogEntry['level'], msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, { time, level, msg }]);
    console.log(`[${level.toUpperCase()}] ${msg}`);
  };

  const runTest = async () => {
    setLogs([]);
    setRunning(true);

    try {
      // Step 1: Check wallet connection
      log('info', 'Step 1: Checking Dynamic wallet connection...');
      if (!primaryWallet) {
        log('error', 'No wallet connected. Please connect first.');
        return;
      }
      const address = primaryWallet.address as Address;
      log('success', `Wallet connected: ${address}`);
      log('info', `Wallet type: ${primaryWallet.connector?.name || 'unknown'}`);

      // Step 2: Get provider from Dynamic
      log('info', 'Step 2: Getting provider from Dynamic wallet...');
      const provider = await primaryWallet.getWalletClient();
      if (!provider) {
        log('error', 'Failed to get wallet client from Dynamic');
        return;
      }
      log('success', 'Got wallet client from Dynamic');

      // Step 3: Create viem wallet client
      log('info', 'Step 3: Creating viem WalletClient...');
      const walletClient = createWalletClient({
        account: address,
        chain: base,
        transport: custom(provider as any),
      });
      log('success', 'WalletClient created');

      // Step 4: Convert to Rhinestone account
      log('info', 'Step 4: Converting to Rhinestone account via walletClientToAccount...');
      const account = walletClientToAccount(walletClient);
      (account as any).type ??= 'json-rpc';
      log('success', `Account created - type: "${(account as any).type}"`);

      // Step 5: Initialize Rhinestone SDK
      log('info', 'Step 5: Initializing Rhinestone SDK...');
      if (!RHINESTONE_API_KEY) {
        log('error', 'VITE_RHINESTONE_API_KEY not set');
        return;
      }
      const sdk = new RhinestoneSDK({ apiKey: RHINESTONE_API_KEY });
      log('success', 'Rhinestone SDK initialized');

      // Step 6: Create 7702 account
      log('info', 'Step 6: Creating Rhinestone account with accountType: "7702"...');
      const rhinestoneAccount = await sdk.createAccount({
        owners: { type: 'ecdsa', accounts: [account] },
        accountType: '7702',
        eoa: account,
      });
      const rhinestoneAddress = rhinestoneAccount.getAddress();
      log('success', `Rhinestone account: ${rhinestoneAddress}`);
      log('info', `EOA match: ${rhinestoneAddress.toLowerCase() === address.toLowerCase()}`);

      // Step 7: Check deployment
      log('info', 'Step 7: Checking deployment status on Base...');
      const isDeployed = await rhinestoneAccount.isDeployed(base);
      log('info', `Account deployed: ${isDeployed}`);

      // Step 8: Sign EIP-7702 init data
      log('info', 'Step 8: Signing EIP-7702 init data...');
      let eip7702InitSignature: Hex | undefined;
      try {
        eip7702InitSignature = await rhinestoneAccount.signEip7702InitData();
        if (eip7702InitSignature && eip7702InitSignature !== '0x') {
          log('success', `Init signature: ${eip7702InitSignature.slice(0, 20)}...`);
        } else {
          log('error', 'signEip7702InitData returned empty/null');
          eip7702InitSignature = undefined;
        }
      } catch (e: any) {
        log('error', `signEip7702InitData failed: ${e.message}`);
      }

      // Step 9: Prepare transaction with USDC gas
      log('info', 'Step 9: Preparing transaction with feeAsset: "USDC"...');
      log('info', `Including eip7702InitSignature: ${!!eip7702InitSignature}`);
      const txParams = {
        chain: base,
        calls: [{ to: rhinestoneAddress as Address, value: 0n, data: '0x' as Hex }],
        feeAsset: 'USDC',
        eip7702InitSignature,
      };

      let preparedTx: any;
      try {
        preparedTx = await rhinestoneAccount.prepareTransaction(txParams);
        log('success', 'Transaction prepared');
      } catch (e: any) {
        log('error', `prepareTransaction failed: ${e.message}`);
        return;
      }

      // Step 10: THE CRITICAL TEST - signAuthorizations
      log('info', 'Step 10: Calling signAuthorizations (THE BUG TEST)...');
      let signAuthFailed = false;
      try {
        const authorizations = await rhinestoneAccount.signAuthorizations(preparedTx);
        log('success', `signAuthorizations succeeded! Got ${authorizations.length} auth(s)`);
      } catch (e: any) {
        signAuthFailed = true;
        log('error', `signAuthorizations FAILED: ${e.message}`);

        if (e.message.includes('Account type') || e.message.includes('json-rpc') || e.message.includes('not supported')) {
          log('error', '>>> BUG CONFIRMED: JSON-RPC account cannot sign EIP-7702 authorizations');
        }
      }

      // Step 11: Try manual workaround via walletClient.signAuthorization
      if (!signAuthFailed) {
        log('info', 'Step 11: Skipping workaround test (signAuthorizations worked)');
      } else {
        log('info', 'Step 11: Testing walletClient.signAuthorization workaround...');
      }
      if (signAuthFailed && typeof walletClient.signAuthorization === 'function') {
        log('info', 'walletClient.signAuthorization exists, trying it...');
        try {
          // We need a delegate address - try to extract from SDK
          const messages = rhinestoneAccount.getTransactionMessages(preparedTx);

          // Serialize with BigInt handling
          const stringify = (obj: any) => JSON.stringify(obj, (_, v) => typeof v === 'bigint' ? v.toString() : v);
          log('info', `Transaction messages: ${stringify(messages).slice(0, 300)}...`);

          // Try to find delegate address in messages
          const msgStr = stringify(messages);
          const addrMatch = msgStr.match(/0x[a-fA-F0-9]{40}/g);
          const delegateAddr = addrMatch?.find(a => a.toLowerCase() !== address.toLowerCase());

          if (delegateAddr) {
            log('info', `Found potential delegate: ${delegateAddr}`);
            try {
              const auth = await walletClient.signAuthorization({
                account: account,
                contractAddress: delegateAddr as Address,
              });
              log('success', `Manual signAuthorization succeeded!`);
              log('info', `r: ${auth.r?.slice(0, 20)}...`);
            } catch (authErr: any) {
              log('error', `walletClient.signAuthorization call failed: ${authErr.message}`);

              // Check if it's an RPC method not supported error
              if (authErr.message.includes('not supported') || authErr.message.includes('Method not found')) {
                log('error', '>>> Wallet does not support wallet_signAuthorization RPC method');
              }
            }
          } else {
            log('error', 'Could not extract delegate address from SDK');
            log('info', 'This means Rhinestone SDK does not expose the delegate contract address');
          }
        } catch (e: any) {
          log('error', `Workaround setup failed: ${e.message}`);
        }
      } else if (signAuthFailed) {
        log('error', 'walletClient.signAuthorization not available on this walletClient');
      }

      // Step 12: Check if Dynamic can export private key (for embedded wallets)
      log('info', 'Step 12: Checking Dynamic wallet capabilities...');
      log('info', `Wallet connector: ${primaryWallet.connector?.name}`);

      // Check if this is an embedded wallet vs external (MetaMask)
      const isEmbedded = primaryWallet.connector?.name?.toLowerCase().includes('embedded') ||
                         primaryWallet.connector?.name?.toLowerCase().includes('dynamic');
      log('info', `Is embedded wallet: ${isEmbedded}`);

      if (isEmbedded) {
        log('info', 'For embedded wallets, Dynamic might support:');
        log('info', '  - Exporting private key (user-initiated)');
        log('info', '  - Server-side authorization signing via API');
        log('info', '  - wallet_signAuthorization RPC method');
      } else {
        log('info', 'External wallet (e.g., MetaMask) detected');
        log('info', 'External wallets would need to implement EIP-7702 signing natively');
      }

      // Check what methods the wallet exposes
      try {
        const connector = primaryWallet.connector as any;
        if (connector?.getWalletClient) {
          log('info', 'Connector has getWalletClient method');
        }
        if (connector?.getSigner) {
          log('info', 'Connector has getSigner method - might return local signer');
        }
        if (connector?.exportPrivateKey) {
          log('info', 'Connector has exportPrivateKey method!');
        }
      } catch (e) {
        // ignore
      }

    } catch (e: any) {
      log('error', `Unexpected error: ${e.message}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ fontFamily: 'monospace', padding: 20, maxWidth: 800, margin: '0 auto' }}>
      <h1>EIP-7702 + Dynamic + Rhinestone Bug Repro</h1>

      <div style={{ marginBottom: 20 }}>
        <DynamicWidget />
      </div>

      {primaryWallet && (
        <div style={{ marginBottom: 20 }}>
          <p>Connected: {primaryWallet.address}</p>
          <p>Type: {primaryWallet.connector?.name}</p>
          <button
            onClick={runTest}
            disabled={running}
            style={{ padding: '10px 20px', fontSize: 16, cursor: running ? 'wait' : 'pointer' }}
          >
            {running ? 'Running...' : 'Run EIP-7702 Test'}
          </button>
        </div>
      )}

      <div style={{
        background: '#1a1a1a',
        color: '#fff',
        padding: 15,
        borderRadius: 8,
        maxHeight: 500,
        overflow: 'auto'
      }}>
        <h3 style={{ margin: '0 0 10px' }}>Logs:</h3>
        {logs.length === 0 && <p style={{ color: '#666' }}>Connect wallet and click "Run Test"</p>}
        {logs.map((l, i) => (
          <div key={i} style={{
            color: l.level === 'error' ? '#ff6b6b' : l.level === 'success' ? '#69db7c' : '#fff',
            marginBottom: 4
          }}>
            <span style={{ color: '#666' }}>[{l.time}]</span> {l.msg}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 20, padding: 15, background: '#f5f5f5', borderRadius: 8 }}>
        <h3>What this tests:</h3>
        <ol>
          <li>Connect Dynamic embedded wallet</li>
          <li>Create Rhinestone account with <code>accountType: '7702'</code></li>
          <li>Prepare a same-chain transaction with <code>feeAsset: 'USDC'</code></li>
          <li><strong>Call <code>signAuthorizations()</code></strong> - this is where the bug occurs</li>
          <li>Try manual workaround via <code>walletClient.signAuthorization</code></li>
        </ol>
      </div>
    </div>
  );
}
