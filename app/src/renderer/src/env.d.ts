/// <reference types="vite/client" />

declare global {
  interface Window {
    retro: import('@shared/api').RetroApi
  }
}

export {}
