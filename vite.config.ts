import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { visualizer } from "rollup-plugin-visualizer";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(), 
    mode === "development" && componentTagger(),
    visualizer({
      filename: './dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
    VitePWA({
      registerType: 'autoUpdate',
      injectManifest: {
        swSrc: 'src/sw.ts',
        swDest: 'sw.js',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,jpg,woff2}'],
      },
      manifest: {
        name: 'Lumen Trade — AI Destekli İşlem Paneli',
        short_name: 'Lumen Trade',
        description: 'AI destekli analizler, gerçek zamanlı grafikler ve sıfır kurulum demo işlem ortamı.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#0a0a0f',
        theme_color: '#0f1117',
        lang: 'tr',
        categories: ['finance', 'business', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
        shortcuts: [
          { name: 'Portföy', url: '/portfolio', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Isı Haritası', url: '/heatmap', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Liderlik', url: '/leaderboard', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('/react/') || id.includes('react-dom') || id.includes('react/jsx-')) return 'vendor-react';
            if (id.includes('@supabase/supabase-js')) return 'vendor-supabase';
            if (id.includes('radix-ui')) return 'vendor-radix';
            if (id.includes('framer-motion')) return 'vendor-motion';
            if (id.includes('lucide-react') || id.includes('@radix')) return 'vendor-ui';
          }
        },
      },
    },
  },
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(process.env.npm_package_version),
  },
}));
