import React from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';

function ConnectWalletModal({ isOpen, onClose, onConnect }) {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  const handleConnect = (connector) => {
    connect({ connector }, {
      onSuccess: () => {
        onConnect();
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="connect-wallet-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        
        {!isConnected ? (
          <>
            <h2>Connect Your Wallet</h2>
            <p className="modal-description">
              Connect your wallet to see your NOIDs and access holder features
            </p>
            
            <div className="wallet-options">
              {connectors
                .filter((connector) => connector.name === 'Injected')
                .map((connector) => (
                  <button
                    key={connector.uid}
                    onClick={() => handleConnect(connector)}
                    disabled={isPending}
                    className="wallet-button"
                  >
                    <span className="wallet-icon">💳</span>
                    <span className="wallet-name">Connect</span>
                  </button>
                ))}
            </div>
            
            <p className="modal-note">
              Don't have a wallet? <a href="https://metamask.io" target="_blank" rel="noopener noreferrer">Get MetaMask</a>
            </p>
          </>
        ) : (
          <>
            <h2>Wallet Connected</h2>
            <p className="wallet-address">
              {address.slice(0, 6)}...{address.slice(-4)}
            </p>
            <button onClick={() => disconnect()} className="disconnect-button">
              Disconnect
            </button>
            <button onClick={onConnect} className="continue-button">
              Continue to Battle
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default ConnectWalletModal;
