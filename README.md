# 🏒 Air Hockey DUO — Multijugador real en Cloudflare Free

Juega **1 contra 1 desde dos celulares distintos**, en tiempo real, usando solamente un enlace. El proyecto incluye página web, física del juego, sincronización por WebSocket, código de sala privado, marcador a 7 goles, revancha y reconexión.

**Diseñado para funcionar en Cloudflare Workers Free + Durable Objects (SQLite)**: ambos teléfonos pueden usar Wi-Fi o datos móviles y abrir el mismo sitio HTTPS. **No requiere Netlify, Render, Firebase ni un servidor propio**.

> Aviso importante: el código se comprobó con pruebas automatizadas locales del motor, salas y reconexión, pero **no se ha podido publicar ni probar en una cuenta real de Cloudflare desde este entorno**. Para comprobar el multijugador en dos teléfonos, primero hay que desplegarlo. El plan gratuito tiene cuotas y no significa tráfico ilimitado.

## 🚀 Opción recomendada: publicar desde Cloudflare + GitHub (sin terminal)

1. Crea cuentas gratuitas en https://github.com y https://dash.cloudflare.com (si todavía no las tienes).
2. **Descomprime el ZIP** y crea un repositorio nuevo en GitHub, por ejemplo `air-hockey-duo-gratis`.
3. Sube **todos los archivos y carpetas** del proyecto al nivel principal del repositorio. Es muy importante que `wrangler.jsonc`, `package.json`, `src/` y `public/` estén en la raíz, no dentro de otra carpeta.
4. En Cloudflare, abre **Workers & Pages → Create application → Import a repository / GitHub** (los nombres pueden variar), concede el acceso y selecciona el repositorio.
5. Establece el nombre del Worker como **`air-hockey-duo-gratis`**, exactamente igual al campo `name` de `wrangler.jsonc`. Si la interfaz requiere un comando de despliegue, usa **`npx wrangler deploy`**. No hace falta ejecutar una compilación del frontend.
6. Pulsa **Save and Deploy**. Confirma que aparezca una dirección similar a `https://air-hockey-duo-gratis.TU-SUBDOMINIO.workers.dev`.
7. En el primer teléfono, abre esa URL y pulsa **CREAR SALA PRIVADA**. Comparte el enlace desde el botón **INVITAR** con tu pareja.
8. En el otro celular, abre el enlace. Al conectarse ambos, comienza automáticamente una cuenta regresiva y ya pueden jugar.

Documentación oficial de Cloudflare para conectar GitHub: https://developers.cloudflare.com/workers/ci-cd/builds/

### Si Cloudflare no muestra GitHub como opción

El método más confiable es publicar desde un computador usando Wrangler, como se explica a continuación.

## 💻 Alternativa: publicar desde un computador

Instala Node.js 20 o posterior y abre una terminal en esta carpeta (descomprimida):

```bash
npm install
npm run check
npx wrangler login
npm run deploy
```

La primera vez, Wrangler te pedirá autorizar tu cuenta de Cloudflare en el navegador y configurar un subdominio `workers.dev` si todavía no tienes uno. Guarda el enlace HTTPS resultante; es el enlace que usarán ambos celulares.

### Probar localmente antes de publicar

```bash
npm install
npm run dev
```

Abre la URL que muestre Wrangler, normalmente `http://localhost:8787`, para probar la interfaz en tu computador. Para jugar **entre celulares distintos** se necesita una dirección HTTPS accesible por internet; `localhost` no es suficiente.

## 💸 ¿De verdad es gratis?

- **Sí, con Workers Free**, respetando las cuotas vigentes del proveedor, que pueden cambiar. No se necesita contratar el plan Workers Paid para usar este proyecto.
- **Durable Objects debe estar respaldado por SQLite**: la migración `new_sqlite_classes` ya está incluida en `wrangler.jsonc`.
- Según la documentación consultada en noviembre de 2026, Durable Objects Free incluye 100.000 solicitudes facturables al día y 13.000 GB-s de duración al día. Los mensajes WebSocket entrantes se convierten a solicitudes en una proporción de **20:1** para el cómputo de solicitudes. Las respuestas WebSocket salientes no se cobran como solicitudes.
- Si se agotan los recursos gratuitos, Cloudflare puede rechazar operaciones hasta que se renueve la cuota. **No ofrece tiempo de juego ilimitado garantizado**.

Precios y límites oficiales: https://developers.cloudflare.com/durable-objects/platform/pricing/

## 📁 Estructura

```text
air-hockey-duo-cloudflare/
├── wrangler.jsonc          # Worker, archivos estáticos y Durable Object SQLite
├── package.json            # Comandos npm y Wrangler
├── src/
│   ├── worker.js           # WebSocket, salas, sincronización y persistencia
│   └── physics.js          # Colisiones, gol, paletas, cronómetro y marcador
├── public/
│   ├── index.html          # Interfaz de bienvenida y pista
│   ├── game.js             # Juego táctil, Canvas, invitación y reconexión
│   ├── styles.css          # Estética neón y adaptable a celulares
│   ├── favicon.svg
│   └── manifest.webmanifest
└── test/
    ├── backend.test.js     # Tests de multijugador y reconexión
    └── physics.test.js     # Tests de reglas y física
```

## ¿Cómo funciona?

1. Ambos teléfonos se conectan por **`wss://`** a la misma aplicación de Cloudflare.
2. El **Durable Object** gestiona las salas, asigna un puesto único a cada jugador y calcula la física en el servidor. Las coordenadas de cada teléfono se convierten para que ambos vean **su portería abajo**.
3. El servidor actualiza las partidas a 60 pasos de simulación/s y retransmite hasta 30 estados/s.
4. El jugador reconecta con un token guardado localmente; su sitio se reserva durante 2 minutos si se desconecta.
5. Cuando las salas están inactivas, el sistema utiliza WebSocket Hibernation API para reducir el consumo de recursos.

**Privacidad:** el código de sala es una invitación privada casual, no una contraseña fuerte. No hay cuentas ni almacenamiento de datos personales fuera del nombre escogido, un token de reconexión y los datos de la partida. No compartas públicamente el enlace si no quieres recibir intentos de conexión de terceros.

## Solución de problemas

- **Solo aparece la pantalla pero no conecta**: comprueba que publicaste el Worker completo, no solamente la carpeta `public/`; revisa que Cloudflare haya creado la migración Durable Object `HockeyHub`.
- **El enlace dice que no existe la sala**: crea una sala nueva en el primer teléfono y comparte el enlace actualizado.
- **Se queda en «Esperando rival»**: el segundo jugador debe entrar en **la misma URL con `?sala=CODIGO`**, o escribir el código de seis caracteres.
- **Error de publicación por nombre**: revisa que en Cloudflare y `wrangler.jsonc` aparezca `air-hockey-duo-gratis`.
- **Problemas con permisos gratuitos**: comprueba el plan Workers Free y los límites de Durable Objects de tu cuenta.

---

**Estado:** versión 2.0 lista para desplegar; pruebas locales automatizadas satisfactorias. Falta verificar el funcionamiento real tras publicar en Cloudflare.
