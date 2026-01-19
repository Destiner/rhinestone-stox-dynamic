import { useState } from 'react';
import { useDynamicContext, DynamicWidget } from '@dynamic-labs/sdk-react-core';
import type { Address, Hex } from 'viem';
import { base } from 'viem/chains';

// Test contract address for delegation
const TEST_DELEGATE_CONTRACT = '0x0000000000000000000000000000000000000001' as Address;

type LogEntry = { time: string; level: 'info' | 'error' | 'success'; msg: string };

// Type for Dynamic WaaS connector with EIP-7702 support
interface DynamicWaasConnector {
  setActiveAccount?: (address: string) => void;
  getActiveAccount?: () => { address: string } | null;
  getSigner?: () => Promise<any>;
  switchNetwork?: (params: { networkChainId: number }) => Promise<void>;
  getNetwork?: () => Promise<number | undefined>;
  isSignAuthorizationSupported?: () => boolean;
  evmNetworks?: { chainId: number }[];
}

export default function Eip7702Test() {
  const { primaryWallet } = useDynamicContext();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [contractAddress, setContractAddress] = useState<string>(TEST_DELEGATE_CONTRACT);
  const [lastAuthorization, setLastAuthorization] = useState<any>(null);

  const log = (level: LogEntry['level'], msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, { time, level, msg }]);
    console.log(`[${level.toUpperCase()}] ${msg}`);
  };

  const runTest = async () => {
    setLogs([]);
    setLastAuthorization(null);
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
      log('info', `Connector: ${primaryWallet.connector?.name}`);

      const connector = primaryWallet.connector as DynamicWaasConnector;
      if (!connector) {
        log('error', 'No connector found');
        return;
      }

      // Step 2: Check EIP-7702 support
      log('info', 'Step 2: Checking EIP-7702 support...');
      if (connector.isSignAuthorizationSupported?.()) {
        log('success', 'EIP-7702 signAuthorization is supported!');
      } else {
        log('info', 'isSignAuthorizationSupported not available or returned false');
      }

      // Step 3: Switch to target network if needed
      log('info', 'Step 3: Checking network...');
      const availableChains = connector.evmNetworks?.map(n => n.chainId) || [];
      log('info', `Available chains: ${JSON.stringify(availableChains)}`);

      if (availableChains.includes(base.id)) {
        const currentNetwork = await connector.getNetwork?.();
        if (currentNetwork !== base.id) {
          log('info', `Switching to Base (${base.id})...`);
          await connector.switchNetwork?.({ networkChainId: base.id });
          log('success', 'Switched to Base');
        } else {
          log('success', 'Already on Base');
        }
      } else {
        log('error', 'Base not available. Add it in Dynamic dashboard.');
        return;
      }

      // Step 4: Set active account (CRITICAL for WaaS)
      log('info', 'Step 4: Setting active account...');
      if (connector.setActiveAccount) {
        connector.setActiveAccount(address);
        const activeAccount = connector.getActiveAccount?.();
        if (activeAccount?.address) {
          log('success', `Active account set: ${activeAccount.address}`);
        } else {
          log('error', 'Failed to set active account');
          return;
        }
      } else {
        log('error', 'setActiveAccount not available on connector');
        return;
      }

      // Step 5: Get signer and sign authorization
      log('info', 'Step 5: Getting signer and signing EIP-7702 authorization...');
      if (!connector.getSigner) {
        log('error', 'getSigner not available');
        return;
      }

      const signer = await connector.getSigner();
      if (!signer) {
        log('error', 'Failed to get signer');
        return;
      }
      log('success', `Signer obtained: ${signer.account?.address || 'unknown'}`);

      if (!signer.signAuthorization) {
        log('error', 'signer.signAuthorization not available');
        return;
      }

      log('info', `Signing authorization for contract: ${contractAddress}`);
      log('info', `Chain ID: ${base.id}`);

      const authorization = await signer.signAuthorization({
        contractAddress: contractAddress as Address,
        chainId: base.id,
      });

      log('success', '=== EIP-7702 AUTHORIZATION SIGNED SUCCESSFULLY! ===');
      log('success', `Contract: ${authorization.contractAddress || authorization.address}`);
      log('success', `Chain ID: ${authorization.chainId}`);
      log('success', `Nonce: ${authorization.nonce}`);
      log('success', `r: ${authorization.r}`);
      log('success', `s: ${authorization.s}`);
      log('success', `yParity: ${authorization.yParity}`);

      setLastAuthorization(authorization);

      log('info', '');
      log('info', 'This authorization can be used in a transaction:');
      log('info', 'walletClient.sendTransaction({');
      log('info', '  authorizationList: [authorization],');
      log('info', '  to: eoaAddress,');
      log('info', '  data: encodeFunctionData(...),');
      log('info', '});');

    } catch (e: any) {
      log('error', `Error: ${e.message}`);
      console.error('Full error:', e);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ fontFamily: 'monospace', padding: 20, maxWidth: 900, margin: '0 auto' }}>
      <h1>EIP-7702 + Dynamic WaaS</h1>
      <p style={{ color: '#666', marginBottom: 20 }}>
        Sign EIP-7702 authorizations with Dynamic WaaS wallet
      </p>

      <div style={{ marginBottom: 20 }}>
        <DynamicWidget />
      </div>

      {primaryWallet && (
        <div style={{ marginBottom: 20 }}>
          <p><strong>Connected:</strong> {primaryWallet.address}</p>
          <p><strong>Connector:</strong> {primaryWallet.connector?.name}</p>

          <div style={{ marginBottom: 15 }}>
            <label style={{ display: 'block', marginBottom: 5 }}>
              Delegate Contract Address:
            </label>
            <input
              type="text"
              value={contractAddress}
              onChange={(e) => setContractAddress(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                fontFamily: 'monospace',
                fontSize: 14,
                border: '1px solid #ccc',
                borderRadius: 4,
              }}
              placeholder="0x..."
            />
          </div>

          <button
            onClick={runTest}
            disabled={running}
            style={{
              padding: '12px 24px',
              fontSize: 16,
              cursor: running ? 'wait' : 'pointer',
              backgroundColor: '#0066cc',
              color: 'white',
              border: 'none',
              borderRadius: 6,
            }}
          >
            {running ? 'Signing...' : 'Sign EIP-7702 Authorization'}
          </button>
        </div>
      )}

      <div style={{
        background: '#1a1a1a',
        color: '#fff',
        padding: 15,
        borderRadius: 8,
        maxHeight: 400,
        overflow: 'auto'
      }}>
        <h3 style={{ margin: '0 0 10px' }}>Logs:</h3>
        {logs.length === 0 && <p style={{ color: '#666' }}>Connect wallet and click "Sign" to begin</p>}
        {logs.map((l, i) => (
          <div key={i} style={{
            color: l.level === 'error' ? '#ff6b6b' : l.level === 'success' ? '#69db7c' : '#fff',
            marginBottom: 4,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}>
            <span style={{ color: '#666' }}>[{l.time}]</span> {l.msg}
          </div>
        ))}
      </div>

      {lastAuthorization && (
        <div style={{ marginTop: 20, padding: 15, background: '#e8f5e9', borderRadius: 8 }}>
          <h3 style={{ margin: '0 0 10px', color: '#2e7d32' }}>Signed Authorization</h3>
          <pre style={{ margin: 0, fontSize: 12, overflow: 'auto' }}>
            {JSON.stringify(lastAuthorization, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2)}
          </pre>
        </div>
      )}

      <div style={{ marginTop: 20, padding: 15, background: '#f5f5f5', borderRadius: 8 }}>
        <h3>How it works:</h3>
        <ol>
          <li>Connect Dynamic WaaS embedded wallet</li>
          <li>Call <code>connector.setActiveAccount(address)</code> to initialize</li>
          <li>Get signer via <code>connector.getSigner()</code></li>
          <li>Sign via <code>signer.signAuthorization({"{"} contractAddress, chainId {"}"})</code></li>
        </ol>
        <p style={{ marginTop: 10, color: '#666' }}>
          <strong>Note:</strong> The key insight is using <code>signer.signAuthorization()</code>
          (from the WalletClient) instead of <code>connector.signAuthorization()</code>.
        </p>
      </div>
    </div>
  );
}
