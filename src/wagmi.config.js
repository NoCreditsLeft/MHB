import { createConfig, http } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { injected, walletConnect, metaMask } from 'wagmi/connectors'

// Free WalletConnect Project ID for testing
// Get your own at: https://cloud.walletconnect.com
const projectId = '8924daf855ff2ba79e6fce8264c5fa59' // https://dashboard.reown.com/

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