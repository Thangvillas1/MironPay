import { create } from 'zustand'

type UIState = {
  // True while a text input is focused with the on-screen keyboard open —
  // lets the bottom tab bar hide itself instead of getting shoved around
  // by iOS Safari's fixed-position-vs-keyboard quirk.
  keyboardOpen: boolean
  setKeyboardOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  keyboardOpen: false,
  setKeyboardOpen: (open) => set({ keyboardOpen: open }),
}))
