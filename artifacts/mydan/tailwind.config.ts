export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Cairo', 'sans-serif'] },
      colors: { primary: '#1A56DB', success: '#108981', danger: '#EF4444' },
    },
  },
  // Tailwind 4 includes rtl:/ltr: variants; logical spacing respects dir="rtl".
};