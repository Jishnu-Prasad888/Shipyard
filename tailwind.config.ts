import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/renderer/**/*.{ts,tsx,js,jsx,css,html}' // include CSS here!
  ],
  theme: {
    extend: {
      fontFamily: {
        fontFamily: {
          sans: ['Poppins', 'system-ui', 'sans-serif']
        }
      }
    }
  },
  plugins: []
}

export default config
