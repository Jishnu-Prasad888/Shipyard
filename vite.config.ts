import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://tauri.app/start/frontend/vite/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,

  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**']
    }
  },

  root: path.join(__dirname, 'src/renderer'),

  build: {
    outDir: path.join(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    // Tauri supports es2021
    target: process.env.TAURI_ENV_PLATFORM == 'windows' ? 'chrome105' : 'safari13',
    // don't minify for debug builds
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    // produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    rollupOptions: {
      input: {
        index: path.join(__dirname, 'src/renderer/index.html')
      }
    }
  },

  resolve: {
    alias: {
      '@renderer': path.join(__dirname, 'src/renderer'),
      '@shared': path.join(__dirname, 'src/shared')
    }
  },

  css: {
    postcss: {}
  }
}))
