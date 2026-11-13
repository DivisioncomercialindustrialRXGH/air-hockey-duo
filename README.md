# 🏒 Air Hockey DUO Arena 5.0 — Online y seis poderes

Actualiza Arena 4.9 sin cambiar controles, diseño, música, equipos, apodos, torneos, bot ni botón ↻.

## Online
- Duelos 1 vs 1 y partidas BOT: 30 estados/s; equipos grandes: 20 estados/s.
- Actualizaciones regulares: sin ráfagas de paquetes WebSocket después de cada rebote.
- El servidor recupera retrasos mediante pequeños pasos de física, conservando colisiones continuas.
- Interpolación con búfer adaptativo de jitter; predicción visual corta de paredes, sin simular goles ni choques de paletas en el teléfono.
- Indicador real de ping del WebSocket. **RED LENTA** cuando el ping supera aproximadamente 240 ms.

## Poderes (se recogen con la bola)
- Existentes: ⚡ Turbo, 🔵 Disco gigante, 🛡️ Paleta gigante.
- Nuevos: 🫧 Mini paleta rival (reduce el tamaño de las paletas rivales al 67% durante 6,5 s).
- 🐢 Bola lenta (velocidad inicial reducida y máximo de 720 px/s durante 6,5 s).
- 🚀 Disparo cargado: el próximo golpe auténtico del equipo dueño sale hacia el rival sin desplazar la pelota de posición. Caduca en 9 s.

## Pruebas
`npm test`. Prueba los dos móviles en la misma Wi-Fi y después usando distintas conexiones para comparar latencia.
El servidor sigue siendo autoridad para goles/colisiones. Si el ping es muy alto o la conexión pierde paquetes, la latencia nunca puede eliminarse por completo mediante animación.
