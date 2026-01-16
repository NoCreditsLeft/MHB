import { createConfig, http } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'

// WalletConnect Project ID
// Get your own at: https://cloud.walletconnect.com
const projectId = '8924daf855ff2ba79e6fce8264c5fa59'

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
