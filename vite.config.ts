import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

const certificate = (file: string) =>
  readFileSync(fileURLToPath(new URL(`./.certs/${file}`, import.meta.url)))

const certificatePath = (file: string) =>
  fileURLToPath(new URL(`./.certs/${file}`, import.meta.url))

const hasLocalCertificate = existsSync(certificatePath('vite-local.pem'))
  && existsSync(certificatePath('vite-local-key.pem'))

export default defineConfig({
  // GitHub project Pages are served below /<repository>/ rather than /.
  // The deployment workflow supplies this value; local development stays at /.
  base: process.env.VITE_BASE_PATH || '/',
  server: {
    // Listen on every network interface so other devices on this LAN can connect.
    host: true,
    // Certificates are intentionally local-only and are not available in CI.
    https: hasLocalCertificate
      ? {
          cert: certificate('vite-local.pem'),
          key: certificate('vite-local-key.pem'),
        }
      : undefined,
  },
})
