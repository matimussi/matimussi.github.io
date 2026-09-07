# Prototipo: bot de cotizacion automatica (Alibaba)

Idea original: el cliente pide un producto -> el bot lo busca en Alibaba ->
devuelve un precio/cotizacion estimada, para ahorrarle ese paso al cliente.

Este prototipo implementa la parte de **busqueda publica** (sin login) con
Playwright: `search.js` abre la pagina de resultados de Alibaba, lee
titulo/precio/MOQ/proveedor de cada listado y arma un rango estimado.

## Que encontramos al probarlo de verdad

Al hacer una sola peticion simple (ni siquiera con navegador, con `curl`) a
`alibaba.com/trade/search`, Alibaba devolvio una **pagina de verificacion
anti-bot** (CAPTCHA "AWSC/punish", scripts de `sufei-punish`) en vez de los
resultados. O sea, el bloqueo no es hipotetico: aparece casi de inmediato,
incluso antes de automatizar nada con un navegador.

Esto confirma el tradeoff que hablamos antes:

- **Scraping directo** (lo que hace este prototipo) es fragil: Alibaba
  detecta trafico no humano rapido y muestra un captcha en vez del contenido.
  Para sortear eso en serio hacen falta cosas como IPs residenciales
  rotativas y resolucion de captchas — que ya no es "automatizar una tarea
  propia" sino evadir activamente las protecciones de la plataforma, algo
  que va contra los Terminos de Servicio de Alibaba y que no vamos a
  implementar.
- **Alibaba Open Platform API** (oficial, para cuentas de negocio) o el
  sistema de **RFQ** (pedido de cotizacion formal al proveedor) son los
  caminos que no violan los TOS, pero no son instantaneos: el RFQ depende de
  que el proveedor responda (horas/dias), y la API tiene alcance limitado
  para compradores.

## Como correrlo (para ver el codigo funcionando / debuggear selectores)

```bash
npm install        # instala playwright (usa el Chromium ya descargado)
node search.js "auriculares bluetooth"
```

Si Alibaba muestra el captcha, el script lo detecta y avisa en vez de
fallar en silencio o insistir.

## Recomendacion

No conviene construir el negocio sobre scraping directo a Alibaba: es
inestable (cambia el HTML, banea IPs, exige captchas) y arriesga que se
bloquee la cuenta/IP de la empresa. Alternativas mas solidas:

1. **Semi-automatico**: el bot arma el link de busqueda y una plantilla de
   mensaje de RFQ; una persona hace el click final. Rapido de construir,
   cero riesgo de baneo.
2. **RFQ automatizado con cuenta real** (requiere decision explicita del
   negocio, ver conversacion): el bot completa el formulario de RFQ de
   Alibaba logueado con la cuenta de la empresa y espera la respuesta del
   proveedor via email/notificacion, que despues un LLM interpreta para
   armar la cotizacion al cliente. Es asincronico (no instantaneo) pero no
   depende de esquivar captchas de busqueda.
3. **Base propia de proveedores ya cotizados**: si se repiten productos,
   guardar las cotizaciones ya conseguidas manualmente y que el bot primero
   busque ahi antes de ir a buscar afuera.
