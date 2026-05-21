import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist-electron',
      emptyOutDir: false,
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/main.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist-electron',
      emptyOutDir: false,
      rollupOptions: {
        input: { preload: resolve(__dirname, 'electron/preload.ts') },
      },
    },
  },
  renderer: {
    root: '.',
    plugins: [react()],
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: { index: resolve(__dirname, 'index.html') },
      },
    },
    resolve: {
      alias: { '@': resolve(__dirname, 'src') },
    },
  },
});
