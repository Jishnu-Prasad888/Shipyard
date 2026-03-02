import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/renderer/**/*.{ts,tsx,js,jsx,css,html}' // include CSS here!
  ],
  theme: {
    extend: {
      fontFamily: {
        branding: ["'Sansita'", 'sans-serif'],
        heading: ["'Play'", 'serif'],
        body: ["'Barlow'", 'sans-serif'],
        ui: ["'M PLUS Rounded 1c'", 'sans-serif']
      },
      colors: {
        'base-bg': '#F7FAFB',
        'base-surface': '#FFFFFF',
        'base-surfaceAlt': '#F1F6F8',
        border: '#D8E2E6',
        'primary-50': '#FFF1E8',
        'primary-100': '#FFD7C2',
        'primary-200': '#FFB38F',
        'primary-300': '#FF8F5C',
        'primary-400': '#FF5B04',
        'primary-500': '#E24E00',
        'primary-600': '#C54300',
        'accent-teal': '#075056',
        'accent-lavender': '#ECD0DE',
        'accent-plum': '#A25166',
        'accent-moss': '#606B1C',
        'accent-sand': '#D2CF7E',
        'dark-base': '#16232B',
        'dark-muted': '#2C3E45',
        'neutral-100': '#E4EEF0',
        'neutral-200': '#DADEE0',
        'neutral-300': '#D7EBF4',
        'success-soft': '#DFF4E8',
        'success-text': '#2D7A4E',
        'warning-soft': '#FFF4DA',
        'warning-text': '#8A6B1F',
        'error-soft': '#FCE8EC',
        'error-text': '#8B3A4A'
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem'
      }
    }
  },
  plugins: []
}

export default config
