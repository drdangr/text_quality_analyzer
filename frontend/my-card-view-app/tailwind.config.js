/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Цветовая схема в стиле Obsidian/VS Code
        panel: {
          bg: '#f8f9fa',
          border: '#e9ecef',
          header: '#f1f3f4',
          hover: '#f5f5f5'
        },
        semantic: {
          signal: {
            min: '#ffffff',
            max: '#ffdb58'
          },
          complexity: {
            min: '#00ff00',
            max: '#ff0000'
          }
        }
      },
      animation: {
        'card-jump': 'cardJump 0.6s ease-in-out',
        'panel-slide': 'panelSlide 0.3s ease-in-out'
      },
      keyframes: {
        cardJump: {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)' }
        },
        panelSlide: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      }
    },
  },
  plugins: [],
} 