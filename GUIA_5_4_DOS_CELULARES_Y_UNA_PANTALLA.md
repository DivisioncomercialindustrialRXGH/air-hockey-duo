# Air Hockey DUO · Arena 5.4 RC1

## Qué trae esta candidata

- **VS BOT:** física local sin WebSocket (conservada de 5.3).
- **Una pantalla:** dos personas tocan el mismo teléfono a la vez; paleta rosa arriba y azul abajo, con marcador, rebotes y seis poderes locales. **No requiere Internet ni PC.**
- **Dos celulares directos:** cada uno usa su pantalla y se comunican por WebRTC DataChannel; un teléfono es anfitrión y calcula la física a 60 Hz. **No usa PC, Cloudflare, STUN, TURN ni servidor de partidas después de cargar la PWA.** Deben estar en una red local que permita comunicación entre ellos. La conexión aún debe validarse en iPhone/Android reales.
- **Online a distancia:** se conserva en Cloudflare.
- **LAN CON PC:** modalidad anterior para hasta 8 jugadores, conservada de 5.3.

## 1. Jugar dos personas en un solo celular

1. Abre Air Hockey DUO ya instalada o cargada en el navegador.
2. Escoge **UNA PANTALLA**.
3. Selecciona duración, puntaje, tamaño de disco y poderes.
4. Pulsa **DOS JUGADORES · INICIAR**.
5. Azul controla la mitad inferior con un dedo; Rosa controla la mitad superior con otro dedo. Pueden moverse simultáneamente.

## 2. Conectar dos teléfonos sin computadora

**Antes de desconectar Internet:** ambos dispositivos deben abrir al menos una vez esta versión del juego desde la URL HTTPS y tener sus recursos guardados en la PWA. El enlace por QR puede abrir Safari fuera de la aplicación instalada y, por tanto, requerir una visita previa también en ese navegador. La transferencia de texto por AirDrop/Quick Share evita depender del lector QR.

1. Conecta ambos teléfonos a **la misma red Wi-Fi**. El router puede no tener salida a Internet. Debe permitir tráfico entre clientes (sin «aislamiento AP»). Hotspots y redes públicas pueden bloquear la conexión.
2. En ambos, abre **DOS CELULARES**.
3. El primer teléfono pulsa **CREAR INVITACIÓN** y muestra el QR/código.
4. El segundo escanea el QR con la aplicación Cámara normal, abre el enlace en la app, y pulsa **RESPONDER INVITACIÓN**. Alternativamente, transfiere el código de texto mediante AirDrop, Quick Share u otro medio local y pégalo en el campo.
5. El segundo genera una **RESPUESTA**. Transfiere esa respuesta al primero mediante QR o texto. Si el QR abre otra pestaña de Safari, el anfitrión intentará recibirla mediante el canal del navegador; si no ocurre, pega manualmente la respuesta en la pantalla original.
6. El anfitrión pega la respuesta en el campo y pulsa **CONECTAR LA RESPUESTA**. La partida comienza cuando el WebRTC DataChannel se abre.

Los QR codifican la invitación **completa**, no un código corto que se consulte en la nube. La cámara web interna de Safari no dispone de `BarcodeDetector` habilitado en la mayoría de versiones, por eso se usa la cámara del sistema operativo y existe el respaldo de texto.

### Si no se conectan

- Deshabilita VPN, Private Relay o aislamiento de clientes del router.
- Comprueba que ambas apps tengan acceso a la red local.
- Prueba una red Wi-Fi privada sin restricciones y vuelve a crear la invitación.
- Si WebRTC no genera rutas ICE locales, el juego mostrará un mensaje en lugar de continuar con un código inutilizable.
- Cambiar de Wi-Fi o bloquear un teléfono durante el emparejamiento puede interrumpir la conexión.

> Compatibilidad real iPhone ↔ Android: **pendiente de validación física**. Las pruebas locales verificaron la señalización, las invitaciones, el código QR y los dos controles, pero el entorno de navegador impide formar rutas UDP ICE reales.

## Pruebas ejecutadas

- Pruebas de física y regresiones del proyecto (`npm run check`).
- Motor de dos jugadores con movimientos independientes, goles, poderes, límites y reinicio.
- Codificación y descodificación de los SDP por gzip/base64url.
- Prueba simulada de oferta/respuesta y mensajes por DataChannel.
- Interfaz 390×844 en Chromium con **dos toques simultáneos reales enviados por CDP**, confirmando que las paletas de ambos lados se movieron de manera independiente.
- QR SVG generado en el navegador y decodificado externamente con OpenCV.
- No se realizó conexión real entre dos teléfonos porque el entorno de prueba restringe la creación de candidatos ICE UDP.

## Seguridad y límites

- La conexión directa cifra los datos mediante DTLS como parte de WebRTC.
- Sin STUN/TURN la conexión solo se intenta mediante rutas de red locales; **no** es la solución para jugadores lejos.
- El teléfono anfitrión es la autoridad de los goles. La modalidad local es para jugar con amigos, no incluye un sistema antitrampas competitivo.
- iPhone «Añadir a pantalla de inicio» / Safari y Android requieren prueba real antes de aprobar la versión para producción.
- Este ZIP **no está publicado en GitHub ni Cloudflare**. El proyecto 5.3 público no se modifica.
