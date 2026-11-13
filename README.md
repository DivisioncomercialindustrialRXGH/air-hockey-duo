# 🏒 Air Hockey DUO Arena 5.2 — duelo LAN (candidata)

**Nuevo modo multijugador local 1 vs. 1**, sin Internet durante las partidas: dos teléfonos conectados a una computadora anfitriona sobre la misma Wi-Fi. Física del servidor LAN a 60 Hz; estados por WebSocket local a 30 Hz. No depende de Cloudflare. Conserva el código online y bot local de Arena 5.1.

- Guía de puesta en marcha: **[GUIA_MULTIJUGADOR_LAN.md](GUIA_MULTIJUGADOR_LAN.md)**
- Inicio rápido: `node lan/server.mjs` (Node 22+, sin `npm install`).
- Mac: `EJECUTAR_LAN_MAC.command`. Windows: `EJECUTAR_LAN_WINDOWS.cmd`.
- Abre la IP mostrada por la computadora desde los dos celulares, crea sala, comparte código de seis caracteres.
- Suite: `npm test` (163/163 pruebas superadas). La interfaz en teléfonos reales y la instalación PWA sobre HTTP local deben probarse.
- **No publicado** en GitHub/Cloudflare. No es todavía una conexión P2P sin computadora.

El diseño de arenas de 3 y 4 equipos se conserva como vista previa, no como multijugador terminado.


## Arena 5.3 — Dos formas de jugar
- **ONLINE a distancia:** WebSocket a Cloudflare (servidor autoritativo). Los teléfonos pueden estar en redes diferentes.
- **Wi-Fi LOCAL:** desde el selector en Inicio, escribe la dirección IP privada que muestra el anfitrión (Mac/Windows) y abre la página local desde cada teléfono. No requiere conexión a Internet durante la partida. El anfitrión debe permanecer encendido. Soporta duelo, 2v2 y 4v4 en la pista clásica de **dos porterías**. Los nuevos mapas de tres/cuatro porterías siguen solo en vista previa.
- **VS BOT sin red:** el motor local calcula la física en el propio teléfono, no mediante el ping de Cloudflare.
- Prueba en dispositivos antes de considerar estable o publicar esta candidata.
