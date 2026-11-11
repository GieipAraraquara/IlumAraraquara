/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.html",
    "./*.js",
    "./js/**/*.js"
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "background": "#fcf8fa",
        "on-primary-fixed": "#131b2e",
        "error": "#ba1a1a",
        "surface-bright": "#fcf8fa",
        "surface-container-lowest": "#ffffff",
        "primary-fixed-dim": "#bec6e0",
        "on-error-container": "#93000a",
        "on-surface": "#1b1b1d",
        "primary": "#000000",
        "outline": "#76777d",
        "on-background": "#1b1b1d",
        "on-tertiary-container": "#75859d",
        "tertiary-fixed-dim": "#b7c8e1",
        "on-tertiary": "#ffffff",
        "surface-dim": "#dcd9db",
        "primary-container": "#131b2e",
        "surface-tint": "#565e74",
        "on-secondary": "#ffffff",
        "inverse-surface": "#303032",
        "on-error": "#ffffff",
        "secondary-container": "#316bf3",
        "inverse-on-surface": "#f3f0f2",
        "surface-container-high": "#eae7e9",
        "on-tertiary-fixed-variant": "#38485d",
        "surface-container": "#f0edef",
        "on-primary-fixed-variant": "#3f465c",
        "surface": "#fcf8fa",
        "on-tertiary-fixed": "#0b1c30",
        "outline-variant": "#c6c6cd",
        "surface-container-highest": "#e4e2e4",
        "tertiary-fixed": "#d3e4fe",
        "primary-fixed": "#dae2fd",
        "on-secondary-fixed-variant": "#003ea8",
        "on-secondary-fixed": "#00174b",
        "on-primary-container": "#7c839b",
        "secondary-fixed": "#dbe1ff",
        "on-secondary-container": "#fefcff",
        "surface-variant": "#e4e2e4",
        "error-container": "#ffdad6",
        "secondary-fixed-dim": "#b4c5ff",
        "inverse-primary": "#bec6e0",
        "tertiary-container": "#0b1c30",
        "on-primary": "#ffffff",
        "surface-container-low": "#f6f3f5",
        "on-surface-variant": "#45464d",
        "secondary": "#0051d5",
        "tertiary": "#000000"
      },
      borderRadius: {
        "DEFAULT": "0.125rem",
        "lg": "0.25rem",
        "xl": "0.5rem",
        "full": "0.75rem"
      },
      spacing: {
        "unit": "4px",
        "max-width-content": "1440px",
        "container-padding": "24px",
        "sidebar-width": "260px",
        "card-gap": "20px",
        "gutter": "16px"
      },
      fontFamily: {
        "headline-lg": ["Inter", "sans-serif"],
        "body-md": ["Inter", "sans-serif"],
        "headline-md": ["Inter", "sans-serif"],
        "data-tabular": ["Inter", "sans-serif"],
        "body-lg": ["Inter", "sans-serif"],
        "label-md": ["Inter", "sans-serif"],
        "label-sm": ["Inter", "sans-serif"],
        "headline-sm": ["Inter", "sans-serif"]
      },
      fontSize: {
        "headline-lg": ["30px", { "lineHeight": "36px", "letterSpacing": "-0.02em", "fontWeight": "700" }],
        "body-md": ["14px", { "lineHeight": "20px", "fontWeight": "400" }],
        "headline-md": ["24px", { "lineHeight": "32px", "letterSpacing": "-0.01em", "fontWeight": "600" }],
        "data-tabular": ["14px", { "lineHeight": "20px", "fontWeight": "500" }],
        "body-lg": ["16px", { "lineHeight": "24px", "fontWeight": "400" }],
        "label-md": ["12px", { "lineHeight": "16px", "letterSpacing": "0.05em", "fontWeight": "600" }],
        "label-sm": ["11px", { "lineHeight": "14px", "fontWeight": "500" }],
        "headline-sm": ["18px", { "lineHeight": "28px", "fontWeight": "600" }]
      },
      animation: {
        "fade-in-up": "fadeInUp 0.5s ease-out forwards",
      },
      keyframes: {
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        }
      }
    }
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries')
  ]
};
