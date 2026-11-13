# 🏒 Air Hockey DUO ARENA — Versión 4.2 (corrección de física y equipos)

Nueva actualización de **Air Hockey DUO** para teléfonos Android/iPhone, alojada en **Cloudflare Workers Free + Durable Objects (SQLite)**. Conserva el servidor multijugador de la versión anterior, código de sala y WebSockets.

## Correcciones puntuales de la versión 4.2

**No se rediseñó la pantalla del juego.** Esta versión atiende los defectos informados en la 4.1:

- **Disco con dirección errática:** eliminada la segunda simulación de rebotes hecha por el teléfono; el servidor determina exclusivamente la física del disco. La imagen en el celular interpola los últimos estados del servidor, evitando correcciones que lo hacían retroceder visualmente.
- **Rebotes falsos o repetidos:** detección continua de choque entre disco y paleta incluso con movimientos rápidos, un solo impulso por contacto, conservación de la normal hasta que los objetos se separan, límite independiente a la fuerza del dedo. Se prueban golpes frontales rápidos y entradas diagonales intensas.
- **Paleta aparentemente trabada:** seguimiento más rápido del dedo y liberación correcta del toque cuando se pierde el foco, se cancela el gesto o se interrumpe la captura del puntero.
- **Equipos 2 vs. 2 y 4 vs. 4:** al crear una sala se elige equipo azul o rosado; al entrar en una sala se puede pedir azul, rosado o cualquiera. Si el equipo elegido está lleno, aparece un aviso en lugar de cambiar de bando sin consultar. Los enlaces de invitación muestran el código y permiten escoger equipo antes de unirse.
- **Golpes más audibles:** mayor volumen y ataque nítido para choque con paleta y pared, compresor de audio para prevenir saturación, valor predeterminado de efectos 90 % para nuevos jugadores. Si ya configuraste volumen antes, se respeta tu preferencia guardada y puedes subirlo desde ♫.
- **Actualización PWA:** service worker versión `hockey-duo-v4-2`, para sustituir correctamente scripts y estilos de la app instalada.

**Pruebas:** 15 comprobaciones automatizadas del servidor, además de revisión de la interfaz en emulador de teléfono de 320 y 375 píxeles sin errores JavaScript. **Aún requiere validación real en dos teléfonos y redes distintas**, especialmente para la sensación de respuesta del disco.

## Novedades

- **Duelo 1 vs. 1** desde dos teléfonos diferentes.
- **Equipos 2 vs. 2** (cuatro teléfonos y dos paletas por equipo).
- **Equipos 4 vs. 4** (ocho teléfonos; cada jugador mueve su paleta por un carril definido).
- **Torneos eliminatorios** de **4, 8, 16 o 32 jugadores**, con sorteos aleatorios, enfrentamientos en serie, clasificación en directo y campeón final. El máximo de 32 es una **decisión del proyecto**, no una garantía de capacidad de la plataforma.
- **Disco de tamaño S, M o L**, a seleccionar al crear la sala.
- **Duración configurable**: 1, 1:30, 2, 3 o 5 minutos, o sin límite.
- **Goles configurables**: 3, 5, 7, 10 o 15. Si hay empate al acabar el tiempo se juega gol de oro.
- Poderes aleatorios: **Turbo**, **Disco gigante**, **Paleta gigante**.
- **Chat de texto y emojis con panel flotante plegable** dentro de la sala, con mensajes limitados y control anti-spam básico.
- **Chat de voz experimental** en 1 vs. 1 y 2 vs. 2 usando WebRTC + STUN. Necesita permiso de micrófono. **No usa TURN:** en algunas redes o restricciones NAT puede no conectar. No se garantiza voz en todos los teléfonos. El audio no se guarda en el servidor.
- **Música de fondo (mezcla incluida) y efectos independientes**, con control de volumen del 0 al 100 %, sonido de impactos, rebotes y goles.
- **Interfaz liquid glass** ligera, efectos de partículas y animación al marcar.
- Física de colisiones con subpasos, choques continuos, huecos reales en las porterías y seguimiento rápido de la paleta.
- Dibujo Canvas con pista prerenderizada, DPR móvil limitado a 1.35, menos mensajes de movimiento y frecuencia reducida para espectadores de torneos.
- **PWA instalable** (iconos 180/192/512, manifiesto, service worker). En iPhone: Safari > Compartir > Añadir a pantalla de inicio; en Android: Chrome > Instalar app / Añadir a pantalla de inicio. El juego requiere Internet para multijugador.
- Botón para solicitar pantalla completa donde el navegador lo permita.

## 🎵 Música de fondo incluida

- El archivo `public/music.m4a` contiene **la mezcla que adjuntó el usuario**, convertida a AAC de baja tasa para móvil, aproximadamente 62 minutos y ~24 MB. Se reproduce bajo demanda, cuando el jugador pulsa ▶ en el panel ♫; **no se descarga ni inicia automáticamente** al entrar en la sala, para priorizar la fluidez del juego.
- Los controles Música, Efectos, Chat y Participantes ahora están **plegados por defecto**; aparecen como pequeños botones en la barra superior. Abrir uno cierra automáticamente los demás, y ninguno hace más pequeña la pista. En torneos se añade el botón 🏆 y la tabla final se abre automáticamente al terminar.
- Si decides publicar esta pista para otras personas, **asegúrate de contar con derechos de distribución y comunicación pública** de la música incluida. Una canción comercial no se vuelve libre de derechos por ser un juego gratuito.

## Publicar la actualización en tu repositorio actual

Tu proyecto ya publicado es `air-hockey-duo` en GitHub y Cloudflare; **no necesitas crear otro proyecto**.

1. Descarga el ZIP de la versión 4.2 y descomprímelo en Windows.
2. En GitHub entra al repositorio actual: `https://github.com/DivisioncomercialindustrialRXGH/air-hockey-duo`.
3. Sustituye/actualiza los archivos dentro de sus mismas rutas (`public/`, `src/`, `test/`, `package.json`, `wrangler.jsonc`, etc.). No subas la carpeta contenedora ni el ZIP como archivo único. Para una actualización de múltiples archivos, GitHub Desktop puede resultar más sencillo que el editor web.
4. Guarda los cambios en la rama `main` mediante un **commit**.
5. En Cloudflare, abre **Workers & Pages → air-hockey-duo → Deployments/Builds** y observa el siguiente despliegue automático. Si fuera necesario, pulsa **Retry build**.
6. El nombre del Worker es ahora `air-hockey-duo`, exactamente como tu despliegue real anterior, para evitar la advertencia por nombre diferente. Conserva `npx wrangler deploy` como comando de despliegue.
7. El enlace del juego continuará siendo `https://air-hockey-duo.global-realtor1.workers.dev`, siempre que tu cuenta y subdominio permanezcan iguales.

**No copies archivos por encima de un juego publicado antes de guardar una copia de la versión anterior.** Esta nueva versión pasó pruebas locales, pero **todavía no fue desplegada ni probada en ocho celulares reales**. Se recomienda primero probar el duelo 1 vs. 1 y después probar las salas grandes. La voz está marcada como experimental por esta razón.

## Pruebas locales

Con Node.js 20 o posterior:

```sh
npm install
npm run check
npm run dev
```

Tests del motor y backend incluyen: conexión y reconexión, gol, rebote, salas llenas, 2 vs. 2, 4 vs. 4, chat y un torneo completo con campeón. También se comprobó en Chromium local la renderización del inicio, configuración de salas, pista, volumen y chat con un WebSocket simulado; **esto no equivale a prueba multijugador real**.

## Costos

El proyecto no necesita base de datos externa ni servidores de pago mientras **permanezca dentro de los límites de Cloudflare Workers y Durable Objects Free**. La sincronización física funciona exclusivamente en el servidor de Cloudflare. El chat de voz es peer-to-peer mediante WebRTC, sin servidor TURN; si necesitas voz garantizada en redes difíciles, podría requerir infraestructura adicional y coste.

## Seguridad y privacidad

Las salas tienen códigos de seis caracteres; son privadas en la práctica, pero **no constituyen un sistema de autenticación fuerte**. No compartas públicamente enlaces de sala si deseas restringir el acceso. Chat y nombres se guardan temporalmente en el Durable Object; los mensajes no están cifrados de extremo a extremo. La sala se elimina tras inactividad. No envíes información privada por el chat.

## Archivos importantes

- `src/worker.js` — Motor de salas, WebSockets, chat, señalización opcional de voz, clasificación y persistencia.
- `src/physics.js` — Colisiones, paletas, poderes, tamaños y límites de la pista.
- `src/tournament.js` — Sorteos, rondas, ganadores y tabla final.
- `public/game.js` — Canvas, input táctil, interpolación autoritativa del disco, sonido, chat y WebRTC opcional.
- `public/music.m4a` — Mezcla completa adjuntada por el usuario, comprimida para móvil; exige derechos antes de alojarla públicamente.
- `public/sw.js` — Service worker para instalar la web como PWA.
- `public/index.html`, `public/styles.css` — Interfaz liquid glass adaptada a móviles.
- `test/*.test.js` — Pruebas automatizadas.

## Actualización rápida sin recrear Cloudflare

**Método recomendado:** GitHub Desktop (gratis). Abre tu repositorio en GitHub, pulsa `Code > Open with GitHub Desktop`, clónalo, copia **el contenido** de este ZIP dentro de esa carpeta, conserva la estructura `src/`, `public/`, `test/`, y luego `Commit to main` + `Push origin`. Cloudflare Workers Builds detecta el nuevo commit en `main` y vuelve a desplegar el mismo Worker `air-hockey-duo`. Verifica en su pestaña Deployments/Builds que terminó en Success.

**Desde GitHub web:** `Add file > Upload files` permite subir archivos, pero para sustitución masiva y arrastrar carpetas es más fácil GitHub Desktop. Nunca subas la carpeta contenedora del ZIP como subcarpeta del repositorio, ni subas el ZIP en lugar de los archivos.

**Precaución de sesiones:** cuando cambias el código del Durable Object, las salas en curso pueden interrumpirse; avisa a los jugadores y haz el despliegue entre partidas.
