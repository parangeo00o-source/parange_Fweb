import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

const certificate = (file: string) =>
  readFileSync(fileURLToPath(new URL(`./.certs/${file}`, import.meta.url)))

export default defineConfig({
  server: {
    // Listen on every network interface so other devices on this LAN can connect.
    host: true,
    https: {
      cert: certificate('vite-local.pem'),
      key: certificate('vite-local-key.pem'),
    },
  },
})
