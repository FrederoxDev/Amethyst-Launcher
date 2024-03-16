/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
        borderWidth: {
            '3': '3px'
        },
        spacing: {
            '90%': '90%',
            '10%': '10%',
        },
    },
  },
  plugins: [],
}

