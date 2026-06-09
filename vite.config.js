import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Crucial for Electron to find files in the dist folder
  server: {
    watch: {
      // Watching packaged output locks the dirs electron-builder renames
      ignored: ['**/release/**', '**/release-builds/**'],
    },
  },
})
