# 🏒 Air Hockey DUO Arena 4.6 — Bot estable + disco en cancha + recuperación

Actualización correctiva sobre **Arena 4.5.1**. Mantiene los equipos, apodos corregidos en ambos teléfonos, música, PWA, torneos, chat y diseño liquid glass.

## Reparaciones
- **BOT**: límites de velocidad por dificultad, aceleración/desaceleración progresivas, objetivos estables y retirada después de golpear. Se eliminó el frenazo instantáneo del controlador que provocaba un tirón medible en una prueba de estrés.
- **Movimiento visual**: interpolación de las paletas remotas entre actualizaciones de red para reducir los saltos a 20 Hz, sin duplicar la simulación de la bola.
- **Bola**: se elimina el impulso añadido cada fotograma durante un contacto prolongado y se comprueban los límites *después* de resolver los choques. Únicamente puede cruzar la línea de fondo por el hueco de gol.
- **Botón ↻ DISCO**: aparece bajo la pista; permite recentrar durante la partida sin tocar puntos ni tiempo. Espera de 15 segundos entre usos por sala, para evitar reinicios abusivos.
- **Caché PWA**: nueva revisión de caché para que la actualización llegue a los celulares.

## Publicación
1. Descomprime el ZIP. Conserva las carpetas `public`, `src` y `test`.
2. Sube el contenido a `DivisioncomercialindustrialRXGH/air-hockey-duo` → **Add file → Upload files**.
3. En `main`, usa el commit **`Arena 4.6 - Bot estable, disco en cancha y reset`**.
4. Revisa Cloudflare Deployments hasta que el build esté en verde; no hace falta otro Worker.
5. Cierra y vuelve a abrir la app instalada en cada teléfono. Usa salas nuevas para las pruebas.

## Pruebas
`npm run check` valida el código y ejecuta **35 pruebas automatizadas**, incluidas pruebas de estrés, comportamiento del bot, límites de cancha y recuperación. Validar adicionalmente en dos teléfonos reales, pues las pruebas locales no garantizan cero tirones de red.

**Nota de música:** el archivo incluido es una mezcla comercial suministrada por el usuario; publicarlo para terceros puede requerir derechos de distribución.
