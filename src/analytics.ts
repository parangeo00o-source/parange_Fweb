// Production-only GA4 bootstrap. History-based page views are handled by the
// web stream's Enhanced Measurement setting, not a second manual page_view.
// https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications
const MEASUREMENT_ID = 'G-PPPHDDBFC3'

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

if (import.meta.env.PROD) {
  window.dataLayer ??= []
  window.gtag ??= function (..._args: unknown[]) {
    // gtag.js expects queued commands in the standard Arguments format.
    window.dataLayer!.push(arguments)
  }
  window.gtag('js', new Date())
  window.gtag('config', MEASUREMENT_ID)

  const tag = document.createElement('script')
  tag.async = true
  tag.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`
  document.head.append(tag)
  // Never await analytics or couple its availability to navigation/rendering.
}
