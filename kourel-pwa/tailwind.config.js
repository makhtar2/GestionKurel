/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#007AFF',
          light: '#5856D6',
        },
        ios: {
          bg: '#F2F2F7',
          card: '#FFFFFF',
        }
      },
      borderRadius: {
        'ios': '20px',
      },
      boxShadow: {
        'ios': '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
      }
    },
  },
  plugins: [],
}
