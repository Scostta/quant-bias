# QuantBias — NQ/ES Daily Bias PWA

Dashboard de bias para scalping NQ y ES en ventana 08:00–10:30 ET.  
Desplegado en Vercel, accesible desde el móvil como app instalable (PWA).

---

## Stack

- **Next.js 14** (App Router)  
- **yahoo-finance2** — datos de mercado gratis, sin API key  
- **Vercel** — deploy con un `git push`  
- **PWA** — instala en pantalla de inicio del móvil

---

## Deploy en Vercel (5 minutos)

### 1. Sube el proyecto a GitHub

```bash
git init
git add .
git commit -m "init"
gh repo create quant-bias --public --push
# o usa github.com para crear el repo manualmente
```

### 2. Conecta con Vercel

1. Ve a [vercel.com](https://vercel.com) → **Add New Project**
2. Importa tu repo de GitHub
3. Framework: **Next.js** (detectado automáticamente)
4. Haz click en **Deploy**

Listo — en 2 minutos tienes tu URL: `https://quant-bias.vercel.app`

### 3. Instalar como app en el móvil

**iPhone (Safari):**
1. Abre la URL en Safari
2. Pulsa el botón de compartir ↑
3. "Añadir a pantalla de inicio"

**Android (Chrome):**
1. Abre la URL en Chrome
2. Menú → "Añadir a pantalla de inicio"
3. O espera el banner automático de instalación

---

## Desarrollo local

```bash
npm install
npm run dev
# Abre http://localhost:3000
```

---

## Estructura

```
quant-bias/
  app/
    api/bias/route.js   ← API: fetcha Yahoo Finance + análisis completo
    page.jsx            ← Dashboard PWA (React, sin CSS framework extra)
    layout.jsx          ← PWA meta tags
    globals.css
  lib/
    indicators.js       ← ATR, VWAP, RSI, ADX, slopes, ML lightweight
    bias.js             ← Dual-layer macro/micro, conflict, ORB, backtest
  public/
    manifest.json       ← PWA manifest
```

---

## Cómo funciona la API

`GET /api/bias` — ejecuta el análisis completo:

1. Descarga 60 días de datos 30m de Yahoo Finance (NQ=F, ES=F)
2. Calcula ATR, VWAP, RSI, ADX, slopes de regresión
3. ML lightweight (logistic score sobre 5 features técnicos)
4. Dual-layer bias: MACRO (sesión) + MICRO (scalp ~2h)
5. Conflict analysis entre capas
6. Backtest 30d en ventana 08:00–10:30 ET
7. Devuelve JSON cacheado 15 minutos en Vercel Edge

---

## Notas

- **Sin API key necesaria** — yahoo-finance2 es gratuito
- **Cache 15min** — Vercel cachea la respuesta automáticamente con `revalidate = 900`
- **ML lightweight** — el modelo GradientBoosting de Python se reemplazó con un  
  score logístico ponderado sobre 5 features (vwap_dist, ret3, ret12, rsi_dev, price_pos).  
  Más rápido para edge functions, similar accuracy para señales macro.
- **Backtest** — se ejecuta en la API route, usa los mismos 60d de datos disponibles

---

## Añadir Finnhub calendar (opcional)

En `app/api/bias/route.js`, descomenta y añade tu key:

```js
const FINNHUB_KEY = process.env.FINNHUB_KEY || ''
```

En Vercel → Settings → Environment Variables → añade `FINNHUB_KEY`.
