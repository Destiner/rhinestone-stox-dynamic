import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';
import RhinestoneTest from './RhinestoneTest';
import Eip7702Test from './Eip7702Test';

const DYNAMIC_ENVIRONMENT_ID = import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID;

if (!DYNAMIC_ENVIRONMENT_ID) {
  throw new Error('VITE_DYNAMIC_ENVIRONMENT_ID is required');
}

function Root() {
  const [page, setPage] = useState<'rhinestone' | 'eip7702'>('rhinestone');

  return (
    <>
      <div style={{ padding: '10px 20px', background: '#f0f0f0', borderBottom: '1px solid #ccc' }}>
        <button
          onClick={() => setPage('rhinestone')}
          style={{
            marginRight: 10,
            padding: '8px 16px',
            background: page === 'rhinestone' ? '#0066cc' : '#fff',
            color: page === 'rhinestone' ? '#fff' : '#333',
            border: '1px solid #ccc',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Rhinestone Test
        </button>
        <button
          onClick={() => setPage('eip7702')}
          style={{
            padding: '8px 16px',
            background: page === 'eip7702' ? '#0066cc' : '#fff',
            color: page === 'eip7702' ? '#fff' : '#333',
            border: '1px solid #ccc',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          EIP-7702 Direct Test
        </button>
      </div>
      {page === 'rhinestone' ? <RhinestoneTest /> : <Eip7702Test />}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DynamicContextProvider
      settings={{
        environmentId: DYNAMIC_ENVIRONMENT_ID,
        walletConnectors: [EthereumWalletConnectors],
      }}
    >
      <Root />
    </DynamicContextProvider>
  </React.StrictMode>
);
