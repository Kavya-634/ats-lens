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
      targets: ['standard_fonts', 'cmaps', 'wasm', 'iccs'].map((dir) => ({
        src: `node_modules/pdfjs-dist/${dir}/*`,
        dest: `pdfjs/${dir}`,
        // v4 keeps the matched path by default; flatten to dist/pdfjs/<dir>/<file>.
        rename: { stripBase: true },
      })),
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
