import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: resolve(__dirname, 'src/main/index.ts')
      }
    }
  },

  preload: {
    build: {
      lib: {
        entry: resolve(__dirname, 'src/main/preload.ts')
      }
    }
  },

  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer')
      }
    },
    plugins: [
      react(),
      tailwindcss() // <-- add Tailwind plugin here
    ],
    css: {
      postcss: {} // needed for Tailwind
    },
    root: resolve(__dirname, 'src/renderer'),
    build: {
      outDir: resolve(__dirname, 'dist/renderer'),
      emptyOutDir: true
    },
    server: {
      port: 5173
    }
  }
})
