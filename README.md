# Air Hockey DUO Arena 5.0.1 — iPhone y pelota junto al borde

Parche sobre Arena 5.0. **No modifica poderes, movimiento de paletas, música, colores, nombres ni dificultad del bot**.

- iPhone instalado desde la pantalla de inicio: la barra superior respeta los márgenes seguros para que el estado EN LÍNEA y el ping en milisegundos no queden debajo de la Dynamic Island/reloj.
- El juego conserva el formato vertical de la cancha y reduce levemente su altura útil cuando la zona segura del iPhone ocupa más espacio.
- Si una paleta empuja la bola contra el borde lateral, el motor ahora la desliza en pasos limitados hasta liberar el contacto; evita que quede atrapada por un choque entre el límite de la pista y el radio de la paleta.
- Añadidas pruebas de regresión para los dos lados de la cancha.

Pruebas de código ejecutadas localmente sobre la base de Arena 5.0: 56 superadas. Es necesario comprobar la apariencia final en iPhone instalado y la física jugando desde el dispositivo.
