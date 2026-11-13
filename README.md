# Air Hockey DUO Arena 4.8 — Disco y bot más fluidos

Actualización de la versión 4.7. Mantiene el mismo diseño, música, nombres, equipos, poderes, PWA, torneos, física del disco y botón ↻.

## Cambios
- Un golpe o rebote normal ya no borra el historial visual del disco.
- Se utiliza el reloj del servidor para que los paquetes WebSocket con retrasos variables no provoquen tirones.
- El disco recupera la posición visual sin teletransportarse después de un retraso de red; los goles y el reset siguen recenterando de inmediato.
- Objetivo de 60 FPS en teléfonos de 60/90/120 Hz, sin reducir los de 90 Hz a 45 FPS.
- Paletas y disco usan gráficos cacheados, sin recalcular sus brillos en cada fotograma.
- Bot más preciso al anticipar el contacto y los rebotes laterales, sin aumentar velocidad ni aceleración.

## Comprobar
Ejecutar `npm test`. Probar partidas BOT Fácil/Difícil/Dios y 2 vs 2 en dos celulares con conexiones distintas.

El servidor de Cloudflare continúa siendo la única autoridad para colisiones, goles y marcadores. Una red lenta todavía puede afectar el tiempo de reacción, aunque el dibujo se vea más fluido.
