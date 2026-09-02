/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          brown: 'var(--brand-brown)',
          'brown-light': 'var(--brand-brown-light)',
          'brown-dark': 'var(--brand-brown-dark)',
          cream: 'var(--brand-cream)',
          'cream-dark': 'var(--brand-cream-dark)',
          gold: 'var(--brand-gold)',
          'gold-dark': 'var(--brand-gold-dark)',
        },
        shell: {
          obsidian: 'var(--shell-obsidian)',
          surface: 'var(--shell-surface)',
          text: 'var(--shell-text)',
          muted: 'var(--shell-muted)',
        },
        success: { DEFAULT: 'var(--success)', 700: 'var(--success-700)', soft: 'var(--success-soft)' },
        danger:  { DEFAULT: 'var(--danger)',  700: 'var(--danger-700)',  soft: 'var(--danger-soft)' },
        warning: { DEFAULT: 'var(--warning)', 700: 'var(--warning-700)', soft: 'var(--warning-soft)' },
        info:    { DEFAULT: 'var(--info)',    700: 'var(--info-700)',    soft: 'var(--info-soft)' },
        body: 'var(--text-body)',
      },
      fontFamily: {
        heading: ['Syne', 'sans-serif'],
        body: ['Outfit', 'sans-serif'],
      },
      spacing: {
        1: 'var(--space-1)', 2: 'var(--space-2)', 3: 'var(--space-3)',
        4: 'var(--space-4)', 5: 'var(--space-5)', 6: 'var(--space-6)',
        8: 'var(--space-8)', 10: 'var(--space-10)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)', md: 'var(--radius-md)',
        lg: 'var(--radius-lg)', pill: 'var(--radius-pill)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)', md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)', gold: 'var(--shadow-gold)',
      },
    },
  },
  plugins: [],
};
