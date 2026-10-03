# 7 endeas

Juego web multijugador con temática endea, basado en las reglas de Flip 7 de `docs/Flip-7.pdf`. Interfaz en español rioplatense, salas por código, partidas en tiempo real y bots para probar sin esperar a otros jugadores.

## La temática endea

¿Endeás una más o te plantás? Cada número es una endea; juntá siete números distintos para hacer **¡7 endeas!** y ganar los 15 puntos extra.

| Carta en 7 endeas | Efecto                                                                   |
| ----------------- | ------------------------------------------------------------------------ |
| **No endeas**     | Bloqueo: termina la ronda de un jugador activo, que conserva sus puntos. |
| **Endeá tres**    | Saca tres: obliga a un jugador activo a robar 3 cartas.                  |
| **Otra endea**    | Vida extra: protege de un número repetido una vez.                       |
| **Endeas extra**  | Mejoras de +2, +4, +6, +8 y +10 puntos.                                  |
| **Doble endea**   | ×2: duplica únicamente la suma de los números.                           |

Los nombres temáticos aparecen en las cartas, las reglas, la elección de objetivos y el historial de la partida. Los prompts de GPT Images usan un motivo abstracto original de siete rayos como referencia visual recurrente al endea.

## Arrancar

Requiere **Node.js 22 o superior** y npm.

```bash
npm install
npm run dev
```

Abrí **http://localhost:5186**. Podés:

- Escribir tu nombre y elegir **Jugar con 2 bots** para probar directamente.
- Crear una sala y compartir su código de 5 caracteres o el enlace **Invitar**.
- Entrar desde otro navegador o pestaña, agregar bots en el lobby y empezar la partida.
- Jugar solo: el lobby permite empezar con una persona.

El servidor corre en `8086`; Vite en `5186`, con proxy de `/socket.io`. Para probar desde el teléfono en la misma red, usá `http://IP-DE-TU-PC:5186` y permití el acceso de Node en el firewall si es necesario. El enlace de invitación usa la dirección desde la que abriste la web.

## Qué incluye la base

- React **18**, Vite, TypeScript, Fastify y Socket.IO.
- Salas privadas de 1 a 12 jugadores y anfitrión con control del lobby.
- Mazo de **94 cartas**: 79 números, 6 mejoras y 9 acciones.
- Pedir carta o plantarse, números repetidos y puntuación por ronda.
- **No endeas**, **Endeá tres** con acciones demoradas y encadenadas, **Otra endea** y transferencia de una segunda vida.
- Arte de las tres cartas especiales y revelación animada con su efecto al recibirlas, incluso por regalo o acción de otro jugador. Los avisos se encolan durante robos múltiples y respetan movimiento reducido.
- **¡7 endeas!**: 7 números distintos, incluyendo el 0, cierre inmediato y bonus de 15.
- El ×2 duplica solamente la suma de los números.
- Descartes por ronda, reciclado del mazo y rotación del repartidor.
- Resumen automático de puntos entre rondas: muestra lo que sumó cada jugador y su total durante 4 segundos, y luego empieza la siguiente sin apretar un botón. Cuando hay un ganador confirmado, aparece directamente la celebración, sin resumen previo; los empates mantienen el resumen y continúan con otra ronda.
- Victoria al terminar una ronda con al menos 200 puntos; desempate jugando otra ronda con todos.
- Celebración de victoria para toda la mesa, con trofeo animado, confeti, nombre y puntuación del ganador. Espera a que se cierren los avisos de cartas especiales y respeta movimiento reducido.
- Bots automáticos, ranking y registro de acciones.
- Reconexión con token de sesión guardado por pestaña, con respaldo en el navegador para recuperar el asiento si el teléfono descarta la pestaña. Si un jugador sigue desconectado cuando le toca actuar, después de 45 segundos se planta; si debía elegir objetivo, se resuelve automáticamente.
- Interfaz responsive, navegación por teclado y reglas dentro de la app.
- Modales portaleados a una capa fija y ajustados al viewport visible, incluidos iPhone/Safari y Chrome en iOS. Bloquean el scroll del fondo, permiten scroll interno y restauran el foco al cerrarse; no requieren la API nativa de `<dialog>`.

## Arte de las cartas especiales

Las tres imágenes aportadas están en `apps/web/public/cards/`, con originales PNG y versiones WebP optimizadas. El manifiesto las registra como caras completas (`printedFaces`), de modo que no se superponen títulos ni íconos sobre el texto de las imágenes.

Si reemplazás los originales `draw3.png`, `life.png` y `freeze.png`, ejecutá:

```bash
npm run import:cards
```

Cada jugador recibe un aviso con la carta, su efecto y un botón **Entendido**. Las vidas quedan visibles junto a la mano; las acciones pendientes se muestran junto a la selección del objetivo. Al reconectar se evita reproducir avisos antiguos; una elección todavía pendiente sí se recuerda.

Al cerrar la ronda hay hasta 3 segundos de margen para los últimos avisos; cuando todos terminaron de leerlos, o se agota ese margen, empieza la cuenta sincronizada de 4 segundos del resumen. El servidor controla el avance y una reconexión no reinicia la cuenta. Si no queda ningún humano conectado, la mesa espera a que alguien vuelva para mostrarle el resumen y continuar.

## Comandos

| Comando                  | Función                                             |
| ------------------------ | --------------------------------------------------- |
| `npm run dev`            | Servidor y web en desarrollo                        |
| `npm run dev:server`     | Solo servidor con recarga                           |
| `npm run dev:web`        | Solo Vite, accesible en LAN                         |
| `npm run typecheck`      | Validación TypeScript                               |
| `npm test`               | Reglas, simulaciones y salas Socket.IO              |
| `npm run test:e2e`       | Flujos desktop/móvil en Chromium                    |
| `npm run build`          | Compila web y servidor                              |
| `npm start`              | Sirve el build completo en `http://localhost:8086`  |
| `npm run generate:cards` | Genera imágenes con GPT Images                      |
| `npm run import:cards`   | Optimiza e incorpora las tres cartas especiales PNG |
| `npm run format`         | Formatea el código                                  |

Antes de la primera ejecución de los tests de navegador:

```bash
npx playwright install chromium webkit
```

Para ejecutar únicamente las pruebas de iPhone con WebKit:

```bash
npm run test:e2e -- --project=iphone-webkit
```

Ejecutá `npm run build` antes de `npm run test:e2e`: las pruebas de cartas especiales usan el frontend compilado con un servidor aislado y mazos controlados, sin endpoints de prueba en producción.

Los tests también se pueden ejecutar contra el build de producción (después de `npm run build`). En PowerShell:

```powershell
$env:E2E_PRODUCTION = "1"
npm run test:e2e
```

## Estructura

```text
apps/
  server/src/          Fastify, Socket.IO, salas, sesiones y turnos de bots
  web/src/             React, pantallas, cartas y estilos
  web/public/cards/    Imágenes GPT y manifiesto
packages/
  engine/src/          Reglas aisladas, dispatch, puntuación y bot
  protocol/src/        Tipos compartidos de eventos y respuestas
scripts/
  generate-cards.mjs   Generador local de arte con GPT Images
tests/
  engine.test.ts       Casos de reglas y simulaciones de partidas
  socket.test.ts       Integración servidor/clientes reales
  e2e/                 Navegadores y responsive
docs/
  Flip-7.pdf           Reglamento aportado
```

Arquitectura inspirada en [endeasExplosivas](https://codeberg.org/saresq/endeasExplosivas): motor separado, servidor autoritativo, protocolo compartido y frontend React/Vite. Esta implementación se escribió para este proyecto.

El navegador envía intenciones; el servidor identifica al jugador, valida el turno y aplica las reglas. La vista pública excluye el orden del mazo y los tokens. Como las cartas se juegan boca arriba, las manos de la ronda son visibles para todos; las manos de jugadores que se plantaron permanecen visibles en esta adaptación para facilitar el seguimiento.

## Alcance de esta versión

Las salas viven en memoria: reiniciar el servidor las borra. Se limpia una sala tras 30 minutos sin actividad y sin humanos conectados. No hay cuentas ni base de datos. Los jugadores nuevos entran antes de empezar; un jugador existente puede reconectar durante la partida. La variante de desafío individual/en pareja de llegar a 200 antes de 5 rondas todavía no tiene un modo separado.

Proyecto fan: reglas y nombre del juego original pertenecen a sus respectivos autores y titulares. El arte generado es original para esta adaptación.
