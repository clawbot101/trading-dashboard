import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Hyperliquid dark theme
        'hl-bg': '#0f1a1f',
        'hl-panel': '#16232b',
        'hl-border': '#1e3038',
        'hl-hover': '#1a2a33',
        'hl-accent': '#50d2c1', // mint/teal
        'hl-profit': '#26a69a', // green-teal for profit/long
        'hl-loss': '#ef5350', // red for loss/short
        'hl-text': '#f0f4f5',
        'hl-secondary': '#8b979e',
        'hl-muted': '#5c6b73',
        // Semantic
        'live': '#50d2c1',
        'stopped': '#5c6b73',
        'filled': '#50d2c1',
        'canceled': '#5c6b73',
        'rejected': '#ef5350',
        'open': '#3b82f6',
        'long': '#26a69a',
        'short': '#ef5350',
      },
      fontFamily: {
        'mono': ['"IBM Plex Mono"', '"JetBrains Mono"', 'monospace'],
        'sans': ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'xs-mono': '11px',
        'sm-mono': '12px',
        'base-mono': '14px',
      },
      borderColor: {
        'hl': '#1e3038',
      },
      boxShadow: {
        'none': 'none',
        'hl': '0 0 0 1px #1e3038',
      },
    },
  },
  plugins: [],
};

export default config;