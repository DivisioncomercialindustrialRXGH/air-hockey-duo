# 🏒 Air Hockey DUO Arena 5.3.0 Online + LAN — dos celulares sin Internet

## Qué funciona en esta entrega

**Duelo 1 vs. 1, 2 vs. 2 o 4 vs. 4 desde varios celulares**, cada uno con su pantalla. Los dos teléfonos y **una computadora anfitriona** se conectan al mismo router Wi-Fi (aunque el router no tenga Internet). Todo el juego, incluidos música, imágenes y física, se distribuye desde la computadora. El servidor LAN calcula las colisiones a 60 pasos/s y envía estados a los jugadores a 30 Hz mediante WebSocket local. **No se usa Cloudflare ni un servidor de Internet.**

También incluye el modo BOT local que se había preparado en Arena 5.1 y el resto del proyecto (modos online para Cloudflare). Las arenas nuevas de 3 y 4 equipos siguen siendo previews, no partidas implementadas. La modalidad LAN también admite los modos actuales 2 vs. 2 y 4 vs. 4, siempre sobre la pista clásica de dos porterías. El torneo sigue siendo solo Online.

## Instalación única

Necesitas una computadora Windows o Mac con **Node.js 22 o superior** instalado. Si todavía no lo tienes, descárgalo cuando dispongas de Internet desde https://nodejs.org. Después de esta instalación no necesitarás Internet para jugar en LAN. Este proyecto LAN **no necesita `npm install`** porque utiliza exclusivamente módulos integrados de Node.

1. Extrae el ZIP completo en la computadora, sin modificar la estructura de carpetas.
2. Conecta **la computadora y ambos teléfonos al mismo Wi-Fi**. Puede ser una red de router sin salida a Internet. Evita Wi-Fi de invitados y activa la comunicación entre dispositivos locales.
3. En Mac, abre `EJECUTAR_LAN_MAC.command` o en Terminal, dentro de la carpeta del proyecto, ejecuta `node lan/server.mjs`. En Windows haz doble clic en `EJECUTAR_LAN_WINDOWS.cmd` o abre CMD y ejecuta `node lan\server.mjs`.
4. La ventana mostrará algo como `http://192.168.1.50:8787`. **Esa dirección es un ejemplo; usa la que muestre TU computadora.** Si aparece una pregunta del firewall, permite acceso a redes privadas solamente.
5. En ambos celulares abre **Safari o Chrome**, escribe exactamente `http://IP-DE-TU-COMPUTADORA:8787` y entra al juego. No abras el enlace público de Cloudflare ni el icono de la PWA instalada: este modo utiliza la dirección LAN que aparece en la computadora.
6. Jugador 1: elige **Duelo 1 vs. 1**, **2 vs. 2** o **4 vs. 4** y presiona **CREAR SALA WI-FI**. Verás el código de seis caracteres.
7. Los otros jugadores: introducen ese código en el campo **CÓDIGO** y presiona **UNIRME**. Al entrar comienza la cuenta regresiva. Cada celular verá su paleta abajo.

La computadora debe mantenerse encendida durante la partida. Si se cierra la ventana o el ordenador duerme, la sala se interrumpe. Las salas LAN se almacenan en memoria; al reiniciar el servidor se crean salas nuevas.

## Si no conecta

- **Ambos celulares y el anfitrión** en el mismo Wi-Fi. Verifica que no estén en la red de invitados. En las opciones del router, desactiva `AP isolation` o `client isolation`.
- La dirección comienza por `http://`, no `https://`. Debe incluir `:8787`.
- En Windows permite Node.js en el Firewall únicamente para redes **privadas**. En Mac autoriza conexiones entrantes para Node si aparece el aviso.
- Abre primero la dirección en el navegador de la computadora; luego prueba desde los celulares. No apagues el Wi-Fi de los celulares aunque la red no tenga Internet.
- No abras puertos en el router hacia Internet. Esta versión LAN es para una red privada de confianza.
- La instalación de PWA desde un HTTP por IP local puede estar bloqueada por el navegador; **juega desde Safari/Chrome**. La aplicación pública instalada no sustituye al servidor LAN.

## Qué NO es este modo

- **No es comunicación directa solo entre dos celulares.** Esta primera implementación requiere una computadora anfitriona. Para eliminarla habrá que implementar conexión punto a punto WebRTC con intercambio de credenciales por QR (sin señalización en Internet) y validarla en Safari iOS y Android. No se afirma que eso esté listo.
- Los modos **2 vs. 2 vs. 2** y **2 vs. 2 vs. 2 vs. 2** con tres o cuatro porterías todavía requieren un motor geométrico nuevo.
- No modifica el juego público de Cloudflare ni publica nada en GitHub.

## Tests ejecutados en este entorno

`node --test test/lan.test.js` — crea sala, empareja dos clientes, espera el inicio, comprueba estados, ping y controles por ambos lados sin conectarse a Cloudflare.

`npm test` — **167/167** pruebas superadas en esta candidata, incluyendo física y pruebas heredadas. Navegador Chrome automatizado: **bloqueado por las restricciones de esta sesión**, por lo que hace falta comprobar la interfaz y respuesta al tacto en teléfonos físicos.

## Fase siguiente: dos celulares sin computadora

Arquitectura prevista: ambos celulares descargan/cachean la app con antelación; uno crea la sala y ofrece un QR de emparejamiento; el segundo lo escanea y devuelve un QR; WebRTC DataChannel enlaza ambos dispositivos de la misma LAN con ICE local sin STUN externo. El teléfono anfitrión ejecuta la física a 60 Hz. Esto tiene requisitos adicionales de señalización y compatibilidad iOS; deberá realizarse y validarse en una iteración independiente.

## Opción online a distancia (dos redes distintas)

Abre https://air-hockey-duo.global-realtor1.workers.dev/ en cada celular. En la pantalla principal deja seleccionada **ONLINE**. Un jugador crea la sala, el otro introduce el código y se conecta a través de Cloudflare. Esta modalidad **sí necesita Internet** y sigue usando el servidor autoritativo; una conexión con mucha latencia puede causar diferencias visuales.

El selector **WI-FI LOCAL** muestra el campo para introducir la IP privada de la computadora. Tras abrirla, toda la partida LAN es local. Para volver a Online pulsa el selector Online desde la página LAN.
