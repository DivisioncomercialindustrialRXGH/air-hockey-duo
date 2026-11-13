# 🏒 AIR HOCKEY DUO ARENA — 4.3

**Corrección de física de alta velocidad + modo contra bot en 3 niveles.**

Esta actualización mantiene el diseño **liquid glass de Arena 4.2**, música y controles plegables. Se ejecuta en el mismo Cloudflare Worker (`air-hockey-duo`) mediante Durable Objects. No es necesario crear otro proyecto ni cambiar de enlace.

## Mejoras principales

### Física del disco (prioridad máxima)

- **Colisión continua / swept circle** para detectar el primer instante de contacto entre el disco y cada paleta **aunque ambos se muevan en un solo fotograma**. Esto reduce el problema de que el disco atraviese la paleta a gran velocidad.
- Los choques se procesan en orden temporal dentro del frame, incluyendo **paredes, postes y huecos reales de portería**.
- Límite de rapidez de disco ajustado a **1.600 unidades/s** para mantener control y coherencia con la frecuencia de estados de red.
- El contacto sostenido con una paleta ya no provoca impulsos completos repetidos. La corrección de solapamiento permite solo un arrastre limitado.
- La paleta mostrada en el móvil no se separa más de 18 unidades de su posición confirmada por el servidor. Esto evita el engaño visual en el que el disco atraviesa una paleta dibujada mucho más adelante que su posición física real.
- Se conserva una sola fuente de verdad para las colisiones: **el servidor Cloudflare**. La interfaz no calcula una física competitiva distinta.

### Nuevo: jugar solo contra el bot

Al crear partida, selecciona **🤖 Contra el bot · jugar solo** y después el nivel:

- **Fácil:** reacción lenta, velocidad reducida y más error de puntería.
- **Difícil:** reacción media, mayor velocidad y puntería más precisa.
- **Dios:** reacción rápida y puntería casi perfecta, **pero sin teletransportarse y con la misma física**.

Al crear la sala, la partida inicia automáticamente: **no hace falta esperar otro teléfono**. Se mantienen los ajustes de puntos, tiempo, tamaño S/M/L, poderes, sonidos y música. Se puede pedir **revancha**. El modo bot **sí requiere Internet** porque juega en el mismo motor del servidor; no es todavía un modo offline.

### Se conservan

Duelo 1 vs 1, equipos 2 vs 2 y 4 vs 4 con elección Azul/Rosado, torneos eliminatorios, mensajes, emojis, voz beta, música y efectos con volúmenes independientes, modo PWA instalable, poderes aleatorios, pantalla completa cuando el navegador lo admite.

## Pruebas y límites

Pruebas locales: **20 casos automatizados superados** (`npm run check`), incluyendo impactos rápidos atravesando el recorrido de una paleta en un solo frame, S/M/L, bot con los tres niveles, revancha, persistencia del bot, reconexiones, equipos y torneos. Son pruebas de código y servidor simulado. **No son una garantía de ausencia total de errores en móviles reales** ni sustituyen pruebas de latencia real.

### Publicar sobre la versión actual

1. Descarga **Air_Hockey_DUO_Arena_4_3_Fisica_Pro_BOT.zip** y descomprímelo.
2. Abre tu repositorio actual: `https://github.com/DivisioncomercialindustrialRXGH/air-hockey-duo`.
3. En **Add file → Upload files**, sube el **contenido** descomprimido conservando rutas: `public/`, `src/`, `test/`, `package.json`, `wrangler.jsonc`. No subas el ZIP ni una carpeta exterior adicional. Si la web no te permite sobrescribir algún archivo, usa su editor o GitHub Desktop, sin borrar el repositorio.
4. Haz **Commit changes** en `main` con un mensaje como `Arena 4.3 - Física avanzada y bot`.
5. Cloudflare debe detectar el nuevo commit y publicar un nuevo build automáticamente. Comprueba el éxito en Workers & Pages → air-hockey-duo → Builds/Deployments.
6. Abre `https://air-hockey-duo.global-realtor1.workers.dev`. Si aún ves 4.2, actualiza la página o cierra/reabre la PWA para que se renueve el service worker.

**Recomendación:** actualiza entre partidas; un despliegue puede interrumpir salas existentes. No hace falta crear otro Worker. El despliegue no se ha realizado desde esta entrega.

### Desarrollo local

Node.js >=20.

```bash
npm install
npm run check
npm run dev
```

Archivos: `src/physics.js` (física y bot), `src/worker.js` (salas y WebSockets), `public/game.js` (interfaz y Canvas), `test/` (pruebas), `public/music.m4a` (mezcla comprimida).

**Nota de música:** tu mezcla incluye música de intérpretes comerciales. Para hacerla pública, debes contar con los derechos correspondientes.

**Costo:** el proyecto puede funcionar en el plan Free de Cloudflare mientras permanezca dentro de sus cuotas.
