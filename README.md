# 🏒 Air Hockey DUO Arena 4.5 — Paletas y equipos identificables

Actualización acumulativa de la versión 4.3: incorpora las correcciones de **4.4** (bot que golpea y respuesta fluida de la paleta en Android) y estas novedades:

- **Azul y Rosado son identidades fijas**, tanto en 1 vs. 1 como en 2 vs. 2 y 4 vs. 4. Cuando el jugador rosado juega desde su teléfono sigue viendo su paleta rosada abajo y la azul arriba; la pista se adapta sin girar los nombres.
- En **2 vs. 2 y 4 vs. 4**, encima de cada paleta aparece el **apodo del jugador**. Los nombres se dibujan en Canvas con un límite de anchura que respeta los carriles estrechos, sin crear elementos HTML por jugador ni ralentizar la física.
- Marcador y porterías mantienen los colores consistentes, sin importar desde qué teléfono se observa la partida.
- Conserva diseño, música, paneles plegables, poderes, chat, voz experimental, torneos y PWA.

## Pruebas

`npm run check` ejecuta las pruebas de física, bot, salas, reconexión y torneos. Se añadieron pruebas nuevas para identificar los equipos de forma consistente en las pantallas opuestas. La publicación en dos móviles distintos continúa siendo una prueba manual necesaria.

## Publicación

1. Descomprimir el ZIP. Subir su **contenido** a `DivisioncomercialindustrialRXGH/air-hockey-duo` mediante **GitHub → Add file → Upload files** (sin subir el ZIP).
2. Crear el commit `Arena 4.5 - Equipos fijos, apodos y bot fluido` en rama `main`.
3. Confirmar despliegue verde en Cloudflare (el mismo Worker y el mismo enlace). No crear otro proyecto.
4. Cerrar por completo la PWA y abrirla de nuevo tras la actualización. Probar una partida desde cada teléfono.

Node.js 20+; Cloudflare Workers + Durable Objects; `npm run check`; `npm run dev`.

**Nota:** La música original contiene obras de terceros; distribuirla públicamente puede requerir permisos de titulares de derechos.
