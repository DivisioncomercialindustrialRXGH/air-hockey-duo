# Air Hockey DUO Arena 4.9 — colisiones y goles corregidos

Parche mínimo sobre Arena 4.8. No modifica interfaz, música, control táctil, poderes, ni velocidad/dificultad del bot.

- Conserva el lado original de contacto durante un solapamiento prolongado con una paleta, evitando que el disco aparezca al otro lado después de una corrección.
- Los goles solo pueden producirse mediante un cruce real y continuo de la línea de gol dentro del cálculo de física; las correcciones de posición no marcan puntos.
- El bot intenta recuperar una pelota que está detrás de su paleta, en su propia zona, sin teletransportarse ni aumentar su velocidad.
- Los poderes permanecen asociados a recogerlos con el **disco**, no con la paleta.

Comprobación local: `npm test` (49 pruebas). Se deben validar los golpes rápidos y las porterías en teléfonos reales tras la publicación.
