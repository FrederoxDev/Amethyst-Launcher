import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    electron({
      main: {
        entry: 'src/main/main.ts',
        vite: {
          build: {
            outDir: 'build/electron/main'
          }
        }
      },
      preload: {
        input: 'src/preload/preload.ts',
        vite: {
          build: {
            outDir: 'build/electron/preload'
          }
        }
      },
      renderer: {}
    })
  ],
  server: {
    port: 3000,
    strictPort: true
  },
  build: {
    outDir: 'build/public',
    target: 'esnext'
  }
})
