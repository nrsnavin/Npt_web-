import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/*
 * The libraries in files of their own. They change only when a library is upgraded, so a
 * returning browser keeps them cached through every deploy of the app and fetches only the app's
 * own, smaller, file again. The pages were already loaded on demand [utils/lazyPage.js]; this
 * splits the part every page shares.
 */
const VENDOR_CHUNKS = [
  ['react', /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/],
  ['router', /[\\/]node_modules[\\/](react-router|react-router-dom|@remix-run|cookie|set-cookie-parser)[\\/]/],
  ['forms', /[\\/]node_modules[\\/]react-hook-form[\\/]/],
  ['http', /[\\/]node_modules[\\/](axios|form-data|proxy-from-env|follow-redirects)[\\/]/],
];

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Lets the app run without VITE_API_URL during local development.
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          for (const [name, pattern] of VENDOR_CHUNKS) if (pattern.test(id)) return `vendor-${name}`;
          if (id.includes('node_modules')) return 'vendor';
          return undefined;
        },
      },
    },
  },
});
