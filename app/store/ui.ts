import { create } from 'zustand'

interface UiState {
  keyboardOpen: boolean
  setKeyboardOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  keyboardOpen: false,
  setKeyboardOpen: (open) => set({ keyboardOpen: open }),
}))
