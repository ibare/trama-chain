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
      '@trama-chain/core',
      '@trama-chain/host-tiptap',
      '@trama-chain/projector-web',
      '@trama-chain/tokens',
    ],
  },
  server: {
    fs: { allow: ['..'] },
  },
});
