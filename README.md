# QuantBias

> Dashboard de contexto pre-sesión para scalping de futuros **NQ** y **ES**  
> Ventana operativa: **15:30 – 17:30 hora España** (9:30 – 11:30 ET)  
> Herramienta de **contexto**, no de señales de entrada.

PWA instalable en móvil · Sin servidor local · Sin API key · Datos Yahoo Finance (~15 min delay)

---

## Aviso importante — LEE ANTES DE USAR

1. **Esta app NO filtra eventos macroeconómicos.** Consulta [ForexFactory](https://www.forexfactory.com) o [Investing.com](https://www.investing.com/economic-calendar/) antes de cada sesión. NFP, FOMC, CPI principal = no operar.
2. **Los datos de Yahoo Finance tienen ~15 min de delay.** La capa micro puede reflejar el mercado de hace 30–45 minutos. Nunca uses el precio mostrado como referencia de timing de entrada.
3. **El backtest tiene n pequeña** (~60 días de datos disponibles en Yahoo Finance 30-min). El accuracy mostrado incluye siempre el intervalo de confianza binomial al 95%. Con n=30, una accuracy de 57% tiene un CI de ±18pp — no hay edge estadístico demostrado.

---

## Horas de referencia

| Evento | ET | España (CEST) | España (CET) |
|--------|-----|----------------|--------------|
| Apertura cash NQ/ES | 9:30 | 15:30 | 15:30 |
| Ventana de análisis | 9:30–11:30 | 15:30–17:30 | 15:30–17:30 |
| Reset VWAP Globex | 18:00 | 00:00+1d | 00:00+1d |
| Overnight range inicio | 18:00 ET día anterior | — | — |

La hora España se calcula dinámicamente con `Intl` (CEST/CET cambia automáticamente con el horario de verano).

---

## Cómo leerlo antes de las 15:30

```
1. ¿Hay noticias macro importantes hoy?   → Consultar ForexFactory ANTES de abrir la app
2. ¿Qué dice el CONFLICT LEVEL?           → Es el veredicto principal
3. ¿Macro y micro coinciden?              → Si sí, mayor confianza
4. ¿Dónde está el precio vs VWAP y niveles? → Define la entrada
5. ¿Qué tipo de día es?                   → Define si buscas breakout o fade
6. ¿Cuál es el accuracy del backtest?     → Leer siempre con el CI — n<30 no tiene edge demostrado
```

---

## 1. CONFLICT LEVEL

**Lo primero que miras.** Combina macro y micro en un veredicto accionable.

| Estado | Qué significa | Qué hacer |
|--------|---------------|-----------|
| `STRONG` | Ambas capas alineadas con fuerza | Operar en esa dirección |
| `MODERATE` | Alineadas pero sin convicción alta | Esperar confirmación de entrada |
| `MACRO DOMINATES` | Estructura macro clara, micro va en contra | Ignorar micro, operar en dirección macro |
| `MICRO DOMINATES` | Momentum puntual contra la estructura | Se puede scalpar, stops muy ajustados |
| `TRUE CONFLICT` | Ambas capas opuestas con igual fuerza | **No operar** — esperar resolución |

---

## 2. MACRO BIAS — Tendencia de sesión

Analiza la estructura de fondo de las últimas ~24 horas.  
**Score de −9 a +9.** Por encima de +6 o por debajo de −6 es señal fuerte.

### REG — Regresión lineal (48 barras · ~24h)
Dirección de la tendencia predominante. `UP` o `DOWN`.

### ADX — Fuerza de tendencia (suavizado de Wilder)
Valores calculados con suavizado RMA (igual que NinjaTrader/TradingView).

| Valor | Interpretación |
|-------|----------------|
| N/D | Datos insuficientes (< 27 barras) |
| < 20 | Mercado lateral — evitar breakouts |
| 20–25 | Tendencia débil |
| > 25 | Tendencia definida ✓ |
| > 35 | Tendencia muy fuerte |

### DI+ / DI−
Si ADX es N/D los DI tampoco son fiables — mostrados como N/D.

---

## 3. MICRO BIAS — Señal de scalp

Analiza el momentum de las últimas horas.  
**Score de −9 a +9.**

> ⚠ La capa micro se degrada visualmente si la última barra tiene más de 45 minutos.
> En ese caso, sólo la capa macro es de fiar para el análisis.

### MOMENTUM SCORE
Puntuación compuesta de 5 features técnicas mediante una fórmula fija (NO es machine learning ni un modelo entrenado):

| Feature | Qué mide |
|---------|----------|
| `vwap_dist` | Distancia del precio al VWAP de sesión, normalizada por ATR |
| `ret3` | Retorno de las últimas 3 barras (~90 min) |
| `ret12` | Retorno de las últimas 12 barras (~6h) |
| `rsi_dev` | Cuánto se aleja el RSI del nivel neutro 50 |
| `price_pos` | Posición del precio dentro del rango de las últimas 16 barras |

**INTENSIDAD** = 0–100 (sin cap artificial). 0 = señal neutra, >60 = señal con peso.

### ORB — Opening Range Breakout
Rango de la primera barra de **30 min desde las 9:30 ET** (apertura cash NQ/ES).  
Estado del precio: `BREAKOUT UP`, `BREAKOUT DOWN` o `INSIDE RANGE`.

| Calidad | Condición | Implicación |
|---------|-----------|-------------|
| `NORMAL` | Rango 0.25–1.5×ATR | Breakouts fiables |
| `EXTENDED` | Rango > 1.5×ATR | Mayor probabilidad de fade |
| `COMPRESSED` | Rango < 0.25×ATR | Breakout explosivo probable |

---

## 4. INDICADORES

### VWAP — Volume Weighted Average Price
VWAP **anclado a sesión Globex** (reset a las 18:00 ET). Usa precio típico `(H+L+C)/3`.  
Si la sesión no tiene datos de volumen reales, muestra **N/D**.

### RSI(14) — suavizado de Wilder
Calculado con RMA (igual que NinjaTrader/TradingView). Seeded con media simple de los primeros 14 periodos.

| Valor | Interpretación |
|-------|----------------|
| > 70 | Sobrecomprado |
| 55–70 | Momentum alcista |
| 45–55 | Zona neutral |
| 30–45 | Momentum bajista |
| < 30 | Sobrevendido |

### ATR(14)
Stop razonable = **0.5–1×ATR** desde entrada.

### DELAY badge
Muestra cuántos minutos han pasado desde la última barra descargada. Si >45 min, la capa micro se degrada visualmente.

---

## 5. NIVELES CLAVE

| Nivel | Descripción |
|-------|-------------|
| **PRED HIGH/LOW** | Proyección estadística del máximo/mínimo del día (regresión lineal 48 barras + ATR) |
| **PDH/PDL** | Previous Day High/Low |
| **ONH/ONL** | Overnight High/Low (18:00 ET día anterior → 9:30 ET) |
| **VWAP** | VWAP de sesión Globex |

---

## 6. TIPO DE DÍA

Clasifica la estructura más probable. El **score** (0–100) mide la afinidad con ese tipo — NO es una probabilidad calibrada.

| Tipo | Estrategia |
|------|-----------|
| `TREND DAY` | Comprar pullbacks, no intentar fades |
| `RANGE DAY` | Comprar soporte, vender resistencia, profits rápidos |
| `NORMAL DAY` | La más frecuente. Combinar ambas estrategias |
| `REVERSAL DAY` | Esperar la vuelta confirmada, no seguir la apertura |

---

## 7. BACKTEST

Evalúa el **mismo pipeline exacto** que la señal en vivo (macro + micro + momentum + conflict), calculado con barras estrictamente anteriores a las 9:30 ET de cada día, frente al resultado open→close en la ventana 9:30–11:30 ET.

| Métrica | Descripción |
|---------|-------------|
| **ACCURACY ±Xpp IC95%** | % de aciertos + intervalo de confianza binomial de Wilson al 95% |
| **n** | Número de días evaluados (días sin datos/ruido/conflicto excluidos) |
| **STRONG** | Accuracy solo en días con movimiento ≥ 0.1% |
| **STREAK** | Racha actual de aciertos |
| **NOISE EX.** | Días excluidos por movimiento < 0.05% |
| **CONFLICTO EX.** | Días excluidos porque el sistema dijo "stand aside" (TRUE CONFLICT) |

**Límite de datos:** Yahoo Finance proporciona ~60 días de barras de 30 min. Con n=30, el CI es ±18pp. Con n=60, el CI es ±13pp. Un accuracy del 57% con n=30 está dentro del ruido estadístico.

**Cómo interpretar:**
- Leer SIEMPRE el número junto al CI. "57% ±18pp" = edge no demostrado.
- Un CI que excede el 50% por abajo también significa potencial edge negativo.
- Nunca usar el accuracy para calibrar tamaño de posición sin un dataset mucho más grande.

---

## Setup e instalación

### Desarrollo local
```bash
pnpm install
pnpm dev
# → http://localhost:3000
```

### Tests
```bash
pnpm test
# → Vitest unit tests en lib/
```

### Deploy en Vercel
```bash
git push origin main
# → vercel.com → Add New Project → importar repo → Deploy
```

### Instalar como app en móvil
- **iPhone (Safari):** Botón compartir ↑ → "Añadir a pantalla de inicio"
- **Android (Chrome):** Menú ⋮ → "Añadir a pantalla de inicio"

---

## Estructura del proyecto

```
quant-bias/
  app/
    api/bias/route.js   ← API: descarga datos + análisis completo + backtest
    page.jsx            ← Dashboard PWA
    layout.jsx          ← PWA meta tags
  lib/
    indicators.js       ← ATR, VWAP (session-anchored), RSI/ADX (Wilder), slopes, momentum score
    bias.js             ← Dual-layer macro/micro, conflict, ORB, day type
    indicators.test.js  ← Vitest unit tests
  public/
    manifest.json       ← PWA manifest
```

---

## Deuda técnica conocida

- **Walk-forward backtest:** Con los ~60 días de Yahoo, el backtest es informativo pero no estadísticamente significativo. Si se dispone de un dataset largo (p.ej. export de NinjaTrader), la función `runBacktest` en `route.js` ya separa claramente la construcción de señal (`preBars`) de la evaluación. El paso siguiente sería un walk-forward con ventanas de entrenamiento/test separadas.
- **Momentum Score weights:** Los pesos actuales (`vwapDist×2.5`, `ret3×800`, etc.) son fijos y no han sido ajustados con datos. Cualquier ajuste futuro requiere train/validation/test separados para evitar curve-fitting.
- **Volumen Yahoo Finance:** En barras de fuera de RTH (overnight/pre-market), Yahoo frecuentemente omite el volumen. El VWAP en esas sesiones puede ser N/D o parcialmente calculado.
