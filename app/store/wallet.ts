import { create } from 'zustand'
import type { Wallet, Transaction, TokenBalance } from '@/app/lib/types'

type WalletState = {
  wallet: Wallet | null
  transactions: Transaction[]
  tokenList: TokenBalance[]
  walletAddress: string | null
  lastFetched: number | null
  setWallet: (wallet: Wallet | null) => void
  setTransactions: (transactions: Transaction[]) => void
  setTokenList: (tokenList: TokenBalance[]) => void
  setWalletAddress: (addr: string | null) => void
  setLastFetched: (ts: number) => void
}

export const useWalletStore = create<WalletState>((set) => ({
  wallet: null,
  transactions: [],
  tokenList: [],
  walletAddress: null,
  lastFetched: null,
  setWallet: (wallet) => set({ wallet }),
  setTransactions: (transactions) => set({ transactions }),
  setTokenList: (tokenList) => set({ tokenList }),
  setWalletAddress: (walletAddress) => set({ walletAddress }),
  setLastFetched: (lastFetched) => set({ lastFetched }),
}))
