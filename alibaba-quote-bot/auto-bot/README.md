# Bot automático (cuenta real, sin revisión humana por mensaje)

Esto es lo que pediste: un bot que se loguea con tu cuenta real de Alibaba,
busca proveedores, les escribe pidiendo cotización, lee la respuesta y arma
el mensaje final para el cliente — sin que nadie apruebe cada mensaje antes
de que salga.

**No es para GitHub Pages.** Esto necesita Node.js corriendo en un servidor
tuyo (una VPS chica alcanza, o tu propia PC prendida). GitHub Pages es
estático, no puede ejecutar esto.

## Leé esto antes de prender el DRY_RUN en false

1. **El login no se puede automatizar del todo.** Alibaba pide
   captcha/verificación al detectar un browser o IP nueva — algo casi seguro
   la primera vez que corras esto desde un servidor. Por eso `login.js` abre
   un Chrome real y necesita que *vos* completes el login a mano una vez
   (usuario, contraseña, y el captcha si aparece). Después el bot reusa esa
   sesión sola hasta que Alibaba la vuelva a desafiar — ahí hay que repetir
   el login a mano. No hay forma honesta de saltarse esto sin implementar
   evasión de captcha, y eso no lo vamos a hacer.

2. **Los selectores de la página están sin verificar contra Alibaba real.**
   No pude probarlos en este entorno: cualquier request a Alibaba sin sesión
   real vuelve con un captcha (ver `alibaba-quote-bot/README.md` para el
   detalle de esa prueba). El código de `src/bot.js` tiene comentarios
   `// TODO verificar selector` en cada punto donde asume una estructura de
   página que puede no coincidir exactamente con lo que ves hoy. Antes de
   usar esto en serio: corré con `DRY_RUN=true` y `HEADLESS=false`, mirá qué
   hace el browser paso a paso, y ajustá lo que no encuentre.

3. **Riesgo de cuenta.** Automatizar clics y mensajes con tu cuenta real va
   contra los Términos de Servicio de Alibaba. Si Alibaba detecta el patrón
   (mensajes muy rápidos, siempre el mismo texto, horarios no humanos),
   puede limitar o suspender la cuenta. Este bot agrega demoras razonables
   y comentarios de log para que puedas auditar qué mandó y cuándo, pero el
   riesgo lo asumís vos al poner `DRY_RUN=false`.

4. **Nada revisa los mensajes antes de salir.** Por diseño (así lo pediste),
   ni el mensaje al proveedor ni la cotización al cliente pasan por una
   persona antes de generarse. Por eso todo queda en `logs/activity.jsonl`
   y `logs/quotes-ready/*.json` — es tu auditoría después del hecho.

## Setup

```bash
cd alibaba-quote-bot/auto-bot
npm install
cp .env.example .env      # completar los umbrales; dejar DRY_RUN=true al principio
npm run login              # una vez, a mano (ver punto 1)
```

## Uso

```bash
# Cargar un pedido de un cliente
npm run add-order -- --product "auriculares bluetooth deportivos" --qty 500 --dest Argentina --specs "color negro"

# Buscar proveedores verificados y escribirles (con DRY_RUN=true solo simula)
npm run run

# Más tarde, revisar si algún proveedor contestó y armar la cotización
npm run check-replies
```

Con `ANTHROPIC_API_KEY` configurada en `.env`, `check-replies` le pide a
Claude que interprete la respuesta del proveedor (más confiable). Sin la
clave, usa una heurística por texto (regex) — igual de rápida pero más
propensa a errores en respuestas raras; por eso cada cotización generada
queda guardada en `logs/quotes-ready/` para que puedas auditarla antes de
mandársela al cliente por el canal que uses con él (WhatsApp, mail, etc. —
eso no está conectado acá, hay que pegarlo a mano o conectar ese canal
aparte).

## Cómo elige proveedor

Solo contacta proveedores marcados como **Verified Supplier** en la página
de resultados, y solo si superan los umbrales de `MIN_RATING` y
`MIN_REVIEWS` de tu `.env`. Si ningún resultado cumple, deja el pedido en
`orders/pending/` sin tocar en vez de escribirle a cualquiera.

## Carpetas

- `orders/pending/` — pedidos cargados, todavía sin buscar proveedor.
- `orders/awaiting-reply/` — ya se contactó a proveedores, esperando que respondan.
- `orders/done/` — cotización final ya generada.
- `logs/activity.jsonl` — registro de cada acción (para qué se contactó, cuándo, si fue dry-run).
- `logs/quotes-ready/` — cotizaciones finales listas para mandarle al cliente.
- `auth-state.json` / `state.json` — se generan solos, nunca se commitean (ver `.gitignore`).
