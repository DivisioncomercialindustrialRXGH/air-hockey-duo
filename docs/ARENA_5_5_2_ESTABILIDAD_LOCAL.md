# Air Hockey DUO 5.5.2 — estabilidad local
## Corregido
- Modo UNA PANTALLA y VS BOT: renderizado a la frecuencia del teléfono, sin modificar el motor físico fijo a 60 Hz. Interpolación visual entre pasos autoritativos; se omite ante colisiones/goles para no dibujar movimientos falsos.
- DOS CELULARES P2P: tras recibir la respuesta, si no existe una ruta ICE utilizable en 25 s, indica el problema y cómo revisar la red. La respuesta del invitado tiene margen para transferirse manualmente; no se marca el enlace como conectado hasta abrirse DataChannel.
- Se actualiza la caché PWA para cargar de forma coherente los módulos locales.
## Qué se conserva
- Arena Cruz 2v2, salas online, modo LAN con PC, juego offline y physics server, sin cambios de reglas ni de cálculos.
## Limitación real
Dos navegadores no siempre pueden establecer WebRTC LAN, aunque el QR se intercambie correctamente. Deben estar en la misma Wi-Fi privada que permita tráfico entre clientes, sin VPN ni aislamiento. En redes que bloquean ICE local, usar LAN con PC u otra red. Las pruebas automáticas no sustituyen una prueba iPhone↔Android real.
## Pruebas
204 pruebas locales superadas. La prueba Playwright de servidor local fue bloqueada por la política de red del entorno.
