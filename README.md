# Air Hockey DUO Arena 5.0.4 RC2 — revisión independiente

Candidata local para validación de producción. Corrige contactos temporales sin mover la posición del disco, separación junto a paredes, tamaños de poderes y salida diagonal de portería. Conserva modos, torneos, bots, audio, diseño, controles y PWA. **No se publicó en GitHub ni Cloudflare.**

- **155/155 pruebas actuales**, incluidas las ocho históricas sin cambiar sus umbrales y su repetición bajo el protocolo RC2.
- **92/92 pruebas originales de Claude**, ejecutadas desde su árbol Git.
- **648.000 pasos de estrés de RC2**, sin penetración observada; corrección espacial por compensación: 0 px.
- A 83 ms, validación con semillas nuevas: **2,8 %** de contactos perdidos frente a **5,6 %** en 5.0.3 y **15,1 %** en RC1; 1.000 intentos por versión.

La red muy degradada sigue causando fallos. La reacción temporal puede llegar tarde y los poderes crecen cuando existe espacio. Se comprobó Chrome emulado y Worker local; **faltan teléfonos físicos, redes reales y carga de múltiples salas en Cloudflare**. No equivale a aprobación de producción.

- [Diagnóstico, comparación y límites de RC2](docs/audit/rc2/AUDITORIA_RC2.md)
- [Integración y validación](docs/audit/rc2/INTEGRACION_RC2.md)
- [Matriz de red](docs/audit/rc2/paired-network.json) y [semillas nuevas](docs/audit/rc2/holdout-network.json)
- [Estrés comparativo](docs/audit/rc2/paired-stress.json)
- [Pruebas ejecutadas](docs/audit/rc2/current-tests.log)
- [Informe histórico RC1](docs/audit/AUDITORIA_FINAL.md), conservado como antecedente

## Reproducir

Node 22+ (auditado en 24.22.0):

```sh
npm ci
npm run check
npm run test:baseline
npm run audit:metrics
npm run audit:holdout
npm run audit:stress
```

Las comparaciones necesitan el historial del bundle entregado o los parches acumulados. Los lanzamientos, entradas, redes y semillas se emparejan entre versiones; el script comprueba igualdad de los lanzamientos. No se compara una física contra otra con diferentes jugadas por terminar antes.

Para Worker local, iniciar `npm run dev -- --local --port 8787`; en otra terminal ejecutar `npm run test:runtime` y, si Playwright/Chromium están disponibles, `npm run test:browser`. Este último admite `AUDIT_PLAYWRIGHT` y `AUDIT_BROWSER` y usa perfiles temporales.

La música original `public/music.m4a` está incluida en el ZIP completo y no cambia respecto de main. Nunca debe borrarse por no aparecer en un parche ligero.
