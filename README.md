# 🏒 Air Hockey DUO Arena 4.7 — Bot fluido + botón ↻ siempre visible

Corrección incremental sobre Arena 4.6. **No cambia diseño, física, música, puntajes, nombres ni salas**.

## Qué corrige

- **Bot sin stop-motion:** la vista anterior solo retenía 55 ms de estados de red y extrapolaba como máximo 22 ms. A 20 mensajes/s, eso dejaba tramos sin movimiento. Se utiliza un búfer de interpolación de 92 ms con 30 estados/s **solo en salas BOT**. La presentación visual es continua a la frecuencia de refresco del móvil; el motor físico sigue autoritativo a 60 Hz.
- **Botón de recuperación visible:** ↻ en la barra superior del juego, junto al botón ♫, incluso en móviles con poca altura. Púlsalo durante la partida para recentrar el disco sin alterar el marcador. Límite de una recuperación por sala cada 15 segundos.
- **PWA:** caché con nueva versión y recursos con indicador v4.7.0, reduciendo riesgo de abrir una interfaz anterior.
- **Pruebas de interpolación:** nuevo archivo `test/motion.test.js`.

## Publicación
Actualización directa del repositorio de GitHub en la rama main, con un solo commit. Cloudflare conserva el mismo Worker y enlace.

## Qué probar
Modo BOT Dios y Difícil, mover el bot de lado a lado y comprobar fluidez. Verifica ↻ al lado de ♫ durante la partida. Prueba pulsarlo y confirmar que vuelve al centro sin cambiar el tanteador. Si un teléfono queda con caché anterior, borra los datos del sitio del juego y vuelve a abrirlo.

**Aviso:** pruebas automatizadas locales no garantizan rendimiento perfecto con todas las conexiones o todos los navegadores. El modo BOT sigue utilizando un servidor en Cloudflare, aunque solo juegue una persona.
