import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-charts': ['recharts'],
          'vendor-ui': ['framer-motion', '@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-popover', '@radix-ui/react-tabs', '@radix-ui/react-accordion', '@radix-ui/react-tooltip', '@radix-ui/react-select', '@radix-ui/react-checkbox', '@radix-ui/react-switch', '@radix-ui/react-slider', '@radix-ui/react-scroll-area', '@radix-ui/react-progress', '@radix-ui/react-radio-group', '@radix-ui/react-label', '@radix-ui/react-separator', '@radix-ui/react-avatar', '@radix-ui/react-alert-dialog', '@radix-ui/react-navigation-menu', '@radix-ui/react-menubar', '@radix-ui/react-hover-card', '@radix-ui/react-collapsible', '@radix-ui/react-context-menu', '@radix-ui/react-aspect-ratio', '@radix-ui/react-toggle', '@radix-ui/react-toggle-group', '@radix-ui/react-slot', '@radix-ui/react-toast'],
        },
      },
    },
  },
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(process.env.npm_package_version),
  },
}));
