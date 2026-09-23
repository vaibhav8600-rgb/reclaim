import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config'

const background = '#0a6e64'

export default defineConfig({
  preset: {
    ...preset,
    // The SVG is full-bleed; iOS rounds the corners itself.
    maskable: { ...preset.maskable, padding: 0.1, resizeOptions: { background } },
    apple: { ...preset.apple, padding: 0, resizeOptions: { background } },
  },
  images: ['public/icon.svg'],
})
