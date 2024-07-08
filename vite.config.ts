import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import renderer from "vite-plugin-electron-renderer"

export default defineConfig({
  base: './',
  plugins: [
    react(),
    renderer()
  ],
  server: {
    port: 3000,
    strictPort: true,
    
  },
  build: {
    outDir: 'build/public'
  }
})
