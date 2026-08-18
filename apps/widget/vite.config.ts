import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// بناء IIFE واحد (frame.js) + CSS واحد (frame.css) — تُخدم من الـ API تحت /w-assets
export default defineConfig({
  plugins: [preact()],
  base: '/w-assets/',
  build: {
    outDir: 'dist',
    cssCodeSplit: false,
    lib: {
      entry: 'src/frame.tsx',
      name: 'CBDWidget',
      formats: ['iife'],
      fileName: () => 'frame.js',
      cssFileName: 'frame',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    minify: 'esbuild',
  },
});
