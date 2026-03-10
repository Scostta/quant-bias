import './globals.css'

export const metadata = {
  title: 'QuantBias',
  description: 'NQ & ES Daily Bias — 08:00–10:30 ET',
  manifest: '/manifest.json',
  themeColor: '#050a0f',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'QuantBias',
  },
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body>{children}</body>
    </html>
  )
}
