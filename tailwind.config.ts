import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        bull: {
          DEFAULT: "hsl(var(--bull))",
          foreground: "hsl(var(--bull-foreground))",
        },
        bear: {
          DEFAULT: "hsl(var(--bear))",
          foreground: "hsl(var(--bear-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        up: {
          DEFAULT: "hsl(var(--color-up))",
          foreground: "hsl(var(--color-up) / 0.9)",
        },
        down: {
          DEFAULT: "hsl(var(--color-down))",
          foreground: "hsl(var(--color-down) / 0.9)",
        },
        neutral: {
          DEFAULT: "hsl(var(--color-neutral))",
        },
        "surface-1": "hsl(var(--color-surface-1))",
        "surface-2": "hsl(var(--color-surface-2))",
        "surface-3": "hsl(var(--color-surface-3))",
        "border-subtle": "hsl(var(--color-border-subtle))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
        price: ["JetBrains Mono", "Roboto Mono", "ui-monospace", "monospace"],
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        "fade-in": { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        "pulse-glow": { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0.5" } },
        "shimmer": { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        "tick-flash-up": { "0%": { color: "hsl(var(--color-up))" }, "100%": { color: "inherit" } },
        "tick-flash-down": { "0%": { color: "hsl(var(--color-down))" }, "100%": { color: "inherit" } },
        "pulse-dots": { "0%, 80%, 100%": { opacity: "0.3" }, "40%": { opacity: "1" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.4s ease-out",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "tick-flash-up": "tick-flash-up 400ms ease-out",
        "tick-flash-down": "tick-flash-down 400ms ease-out",
        "pulse-dots": "pulse-dots 1.4s ease-in-out infinite",
      },
      transitionDuration: {
        tick: "120ms",
        panel: "200ms",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
