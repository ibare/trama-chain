import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/trama/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  optimizeDeps: {
    exclude: [
      '@trama/core',
      '@trama/host-tiptap',
      '@trama/projector-web',
      '@trama/tokens',
    ],
  },
  server: {
    fs: { allow: ['..'] },
  },
});
