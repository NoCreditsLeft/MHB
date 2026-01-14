import { createConfig, http } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { injected, walletConnect, metaMask } from 'wagmi/connectors'

// Free WalletConnect Project ID for testing
// Get your own at: https://cloud.walletconnect.com
const projectId = 'a01e2f3b4c5d6e7f8g9h0i1j2k3l4m5n' // We'll use a placeholder for now

export const config = createConfig({
  chains: [mainnet],
  connectors: [
    injected(), // Detects MetaMask, Coinbase Wallet, etc.
    metaMask(),
    walletConnect({ 
      projectId,
      showQrModal: true // Shows QR code for mobile wallets
    })
  ],
  transports: {
    [mainnet.id]: http() // Uses public Ethereum RPC
  }
})