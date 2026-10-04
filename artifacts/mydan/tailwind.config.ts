export default {
  content: { relative: true, files: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'] },
  theme: {
    extend: {
      fontFamily: { sans: ['Cairo', 'sans-serif'] },
      colors: { primary: '#1A56DB', success: '#108981', danger: '#EF4444' },
    },
  },
  // Logical spacing and rtl: variants respect the document's dir="rtl".
};