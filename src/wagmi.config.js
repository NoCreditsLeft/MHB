import { createConfig, http } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'

// WalletConnect Project ID
// Get your own at: https://cloud.walletconnect.com
const projectId = 'a01e2f3b4c5d6e7f8g9h0i1j2k3l4m5n' // Replace with your real project ID

export const config = createConfig({
  chains: [mainnet],
  connectors: [
    injected(), // Browser wallets (MetaMask, Coinbase Wallet, etc.)
    walletConnect({ 
      projectId,
      showQrModal: true // Shows QR code for mobile wallets
    })
  ],
  transports: {
    [mainnet.id]: http() // Uses public Ethereum RPC
  }
})
