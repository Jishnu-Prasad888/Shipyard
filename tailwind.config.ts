/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        border: {
          DEFAULT: 'var(--color-border)',
          strong: 'var(--color-border-strong)'
        },
        text: 'var(--color-text)',
        muted: 'var(--color-muted)',
        primary: {
          DEFAULT: 'var(--color-primary)',
          soft: 'var(--color-primary-soft)'
        },
        warning: 'var(--color-warning)',
        alert: 'var(--color-alert)'
      }
    }
  },
  plugins: []
}
