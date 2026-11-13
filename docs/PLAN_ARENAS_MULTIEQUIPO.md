# Air Hockey DUO — Arquitectura futura: 3 y 4 equipos

**Estado:** diseño aprobado para exploración, pero el juego actual no ofrece estos modos todavía. La vista previa está en `public/arena-lab.html` y no contiene simulación multijugador ni se considera producto final.

## Modos

- `tri-duo`: **2 vs 2 vs 2**, 6 personas, arena triangular con tres porterías, tres equipos de dos.
- `quad-duo`: **2 vs 2 vs 2 vs 2**, 8 personas, arena cuadrangular con cuatro porterías, cuatro equipos de dos.
- Cada jugador tiene una zona de control definida alrededor de su portería y nunca puede entrar en la zona defensiva de otro equipo.

## Propuesta de juego

Una bola física y un reloj común. Cada extremo de la pista tiene **portería propia**; el último equipo que toque el disco antes de un gol recibe el punto si no es el equipo del arco concedido. Un autogol no otorga puntos al equipo que concedió (se puede implementar puntaje neutral o penalización, por definir con pruebas).

La cámara de cada jugador rota el mundo para mostrar su propia portería abajo; las entradas táctiles se transforman a coordenadas de mundo con una matriz de rotación e inversión validada por el servidor. No usar `sideFor` binario ni `teamSize` actual tal cual: hoy solo soportan dos equipos.

## Motor autoritativo requerido

1. Representar arena mediante polígono convexo y sus segmentos, marcando cada tramo como `wall`, `goal`, `post`.
2. Resolver tiempo de impacto del disco contra cada segmento y poste circular; atribuir goles al arco realmente cruzado, no a un clamp de Y.
3. Diseñar zonas defensivas con límites poligonales y colisión continua entre paletas; respaldar el sistema con pruebas de seis y ocho paletas simultáneas.
4. Generalizar `scores[]`, `goalBy`, `winner`, `teamOf`, `seatsRequired`, asignación de plazas, selección de equipo, render de marcador y torneos.
5. Exigir desde el cliente un marco de coordenadas consistente con la vista de cada jugador; el servidor verifica pertenencia de paleta a zona de equipo.
6. Pruebas de simetría por rotación, post/ángulo, goles simultáneos, poderes con radios alterados, RTT, pérdida y desconexiones.
7. Mantener la infraestructura gratuita de Cloudflare; medir el coste real de más conexiones y evitar migraciones del namespace de producción hasta probar staging.

## Orden de desarrollo

Fase A: física triangular/cuadrangular con simulaciones y pruebas, sin interfaces públicas. Fase B: 6/8 jugadores, orientaciones y marcador. Fase C: redes, poderes, beta en staging. Fase D: habilitar selección de modo tras jugabilidad certificada.

**No juntar la migración de arenas con el parche de estabilidad de la versión 5.1.**
