/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// pdf.js needs a few runtime assets (standard fonts, CMaps, WASM decoders)
// that are fetched lazily from the same origin. They are copied into the
// build output so the app stays fully self-hosted with no third-party CDN.
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: 'node_modules/pdfjs-dist/standard_fonts/*', dest: 'pdfjs/standard_fonts' },
        { src: 'node_modules/pdfjs-dist/cmaps/*', dest: 'pdfjs/cmaps' },
        { src: 'node_modules/pdfjs-dist/wasm/*', dest: 'pdfjs/wasm' },
        { src: 'node_modules/pdfjs-dist/iccs/*', dest: 'pdfjs/iccs' },
      ],
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
