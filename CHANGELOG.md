# CHANGELOG

## Refactor de honestidad técnica — 2026-06-12

Ocho fixes en orden de criticidad, un commit por fix.

---

### FIX 1 — VWAP anclado a sesión Globex (crítico)

**Problema:** `computeVWAP` acumulaba close×volume sobre los ~58 días completos del dataset, produciendo una media ponderada de dos meses, no un VWAP intradía.

**Cambios:**
- Reset del acumulado a las **18:00 ET** (apertura Globex), usando `America/New_York` para el corte.
- Precio típico `(H+L+C)/3` en lugar del close.
- Barras con `volume == null` excluidas del acumulado. Si toda la sesión carece de volumen real, VWAP devuelve `null` y la UI muestra "N/D".
- `normalizeQuote`: fallback de volumen cambiado de `1` a `null`.
- Propagado a `vwapDistPct`, `computeMacroBias`, `computeMicroBias`, `computeMomentumScore`.
- **Añadido vitest** + 4 tests unitarios verificando el reset de sesión y la exclusión de volumen.

**Archivos:** `lib/indicators.js`, `lib/bias.js`, `app/api/bias/route.js`, `lib/indicators.test.js`, `package.json`

---

### FIX 2 — ORB en apertura real de cash: 9:30 ET (crítico)

**Problema:** `openingRange` capturaba la barra de las **8:30 ET** como ORB. La apertura de cash NQ/ES es a las **9:30 ET**.

**Cambios:**
- Constante `SESSION` en `route.js` como única fuente de verdad para horas de sesión (9:30 cash open, 11:30 analysis end, orbBars=1).
- `openingRange` usa `SESSION.cashOpenHour/Min` + `SESSION.orbBars×30` para seleccionar las barras ORB.
- Parametrización: cambiar `orbBars` a 2 con barras de 15 min selecciona los 30 primeros minutos correctamente.
- `overnightRange` refactorizado para recibir `refDateET` explícito (usado también en el backtest).
- Hora España derivada con `Intl` en el frontend (nunca hardcodeada).

**Archivos:** `app/api/bias/route.js`

---

### FIX 3 — Backtest del sistema real con intervalo de confianza (crítico)

**Problema:** `runBacktest` evaluaba un mini-score de 3 factores (slope, vwap, onMid) en la ventana 8:00–10:30 ET. No medía el bias que el usuario ve, y no reportaba CI.

**Cambios:**
- `runBacktest` eliminado de `lib/bias.js` y reimplementado en `route.js` como función local con acceso a todos los helpers.
- **Pipeline idéntico al live:** para cada día histórico, computa `computeATR`, `computeVWAP`, `computeRSI`, `computeADX`, `rollingSlope`, `regressionRange`, `overnightRange`, `computeMomentumScore`, `computeMacroBias`, `computeMicroBias`, `conflictAnalysis` usando **solo barras anteriores a las 9:30 ET**.
- Outcome: open→close de la ventana **9:30–11:30 ET**.
- Días excluidos: movimiento < 0.05% (ruido) y TRUE CONFLICT (sistema dijo stand aside). Ambos contados separadamente.
- **Intervalo de confianza Wilson 95%** incluido en cada resultado (`ci.margin`).
- UI muestra "57% ±18pp IC 95% (n=30)" — nunca un número solo.
- Nota de límite de datos (~60 días Yahoo Finance) visible en la UI.

**Archivos:** `lib/bias.js`, `app/api/bias/route.js`, `app/page.jsx`

---

### FIX 4 — Eliminar el "ML" falso (crítico)

**Problema:** `mlBiasLightweight` es una suma ponderada fija con sigmoide, no un modelo entrenado. La "confianza" estaba artificialmente capada al 82% y `modelAcc: 55` estaba hardcodeado.

**Cambios:**
- `mlBiasLightweight` → `computeMomentumScore`.
- Campo `confidence` (escala 50–82%) → `signalIntensity` (escala 0–100 sin cap).
- Eliminado `modelAcc: 55` hardcodeado de `conflictAnalysis`.
- UI: "ML MODEL" → "MOMENTUM SCORE", "ACC X%" → "INTENSIDAD X/100".
- Comentarios y README: prohibida la palabra "ML", "machine learning" o "modelo".

**Archivos:** `lib/indicators.js`, `lib/bias.js`, `app/api/bias/route.js`, `app/page.jsx`

---

### FIX 5 — Calendario económico: eliminar banner fantasma (alto riesgo)

**Problema:** `page.jsx` leía `state.data[sym].calendar` pero `route.js` nunca generaba ese campo. El banner de "filtro de noticias" era una funcionalidad inexistente que podría dar falsa seguridad.

**Cambios:**
- Eliminado el banner dinámico de calendario y toda la lógica asociada (`CAL_STYLE`, `calData`, `calSt`).
- Sustituido por un **aviso estático permanente**: "Esta app NO filtra eventos macroeconómicos. Consulta ForexFactory / Investing.com."

**Archivos:** `app/page.jsx`

---

### FIX 6 — RSI y ADX con suavizado de Wilder (medio)

**Problema:** `computeRSI` y `computeADX` usaban medias simples rolling. Los valores no coincidían con NinjaTrader/TradingView. Los defaults `?? 20` devolvían un valor que coincide con los umbrales de decisión (ADX=20 es "tendencia débil").

**Cambios:**
- **RSI:** suavizado RMA (alpha=1/period), seeded con media simple de los primeros `period` cambios.
- **ADX:** smoothed TR, +DM, -DM con la fórmula Wilder completa (`smTR = smTR - smTR/period + TR[i]`). ADX seeded con mean simple del primer lote de DX.
- Eliminados los `?? 20` defaults — valores `null` propagados a API y UI (N/D).
- Guards añadidos en `computeMacroBias`, `computeMicroBias`, `classifyDayType`, `conflictAnalysis`.
- **8 tests unitarios** añadidos: RSI en límites, RSI neutro en moves iguales, ADX insuficiencia de datos, DI+ > DI- para tendencia alcista.

**Archivos:** `lib/indicators.js`, `lib/indicators.test.js`, `lib/bias.js`, `app/api/bias/route.js`

---

### FIX 7 — Honestidad sobre latencia de datos (medio)

**Problema:** Yahoo lleva ~15 min de delay y la app cachea 15 min más. La capa micro podía reflejar el mercado de hace 30–45 min sin que el usuario lo supiera.

**Cambios:**
- API devuelve `lastBarTs` (timestamp de la última barra descargada).
- UI muestra badge "DELAY ~Xm · última barra HH:MM" junto al nombre del símbolo, en hora España.
- Si `lastBarTs` tiene > 45 min de antigüedad, la capa MICRO se degrada visualmente (color gris + "SEÑAL OBSOLETA >45min").

**Archivos:** `app/api/bias/route.js`, `app/page.jsx`

---

### FIX 8 — Limpieza menor (bajo)

**Cambios:**
- `rollingSlope`: corregido off-by-one — `slice(i - window + 1, i + 1)` incluye la barra actual.
- `regressionRange`: comentario explica que `slope * n + intercept` es una proyección 1 barra hacia delante (intencional).
- `normalizeQuote`: `console.warn` agregado (no por barra) cuando hay barras sin volumen real.
- `classifyDayType`: `prob` → `score` (no es una probabilidad calibrada). API: `dayProb` → `dayScore`. UI: "score X/100" en lugar de "X%".

**Archivos:** `lib/indicators.js`, `lib/bias.js`, `app/api/bias/route.js`, `app/page.jsx`

---

## Estado tras el refactor

### Qué cambió por archivo

| Archivo | Cambios principales |
|---------|---------------------|
| `lib/indicators.js` | VWAP session-anchored; RSI/ADX Wilder; rollingSlope corregido; mlBiasLightweight→computeMomentumScore; cap eliminado |
| `lib/bias.js` | Guards null vwap/adx/rsi; prob→score; runBacktest eliminado; conflictAnalysis sin modelAcc |
| `app/api/bias/route.js` | SESSION config; ORB a 9:30 ET; overnightRange con refDateET; runBacktest pipeline completo; volume→null; lastBarTs; dayScore |
| `app/page.jsx` | CI en backtest; banner calendario→disclaimer estático; ML→MOMENTUM SCORE; DataDelayBadge; degradación micro; score X/100 |
| `lib/indicators.test.js` | 12 tests unitarios (VWAP ×4, RSI ×4, ADX ×4) |

### Deuda técnica que queda

1. **Walk-forward:** Con ~60 días disponibles, el backtest es orientativo. El código ya separa `preBars` (señal) de `cashBars` (outcome) de forma limpia. Falta: ingesta de un dataset largo (NinjaTrader export), ventanas train/test/walk-forward.
2. **Momentum Score weights:** Los pesos fijos no han sido ajustados. Cualquier ajuste futuro requiere pipeline train/val/test separado.
3. **Volumen overnight:** Yahoo omite frecuentemente volumen en barras pre-market. VWAP puede ser null o parcial en esas sesiones — comportamiento correcto pero el usuario debe saberlo.
4. **Calendario económico:** Implementar con fuente fiable (opción A del brief) queda como mejora futura.
