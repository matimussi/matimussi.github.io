// Misma logica de extraccion que cotizador.html, portada a Node para que el
// bot la use al leer las respuestas del proveedor sin depender de un navegador.

export function heuristicParse(text) {
  const get = (re) => {
    const m = text.match(re);
    return m ? m[1] : null;
  };

  const price =
    get(/\$\s?(\d+(?:\.\d+)?)\s*\/\s*(?:pc|pcs|piece|pieces|unit|units)/i) ||
    get(/(?:unit\s*price|price)[^\d$]{0,20}(?:US\$|USD|\$)\s?(\d+(?:\.\d+)?)/i) ||
    get(/(?:US\$|USD|\$)\s?(\d+(?:\.\d+)?)/);
  const moq =
    get(/MOQ[^\d]{0,15}(\d[\d,]*)/i) || get(/minimum\s*order[^\d]{0,20}(\d[\d,]*)/i);
  const leadTime = get(/(\d+\s*[-–~]{1,2}\s*\d+\s*days?)/i) || get(/(\d+\s*days?)/i);
  const shipping = get(/(?:shipping|freight)[^\d$]{0,30}(?:US\$|USD|\$)\s?(\d+(?:\.\d+)?)/i);
  const sampleLine = (text.match(/[^.\n]*sample[^.\n]*\.?/i) || [null])[0];

  return {
    unitPrice: price ? Number(price.replace(/,/g, "")) : null,
    moq: moq ? Number(moq.replace(/,/g, "")) : null,
    leadTime,
    shipping: shipping ? Number(shipping.replace(/,/g, "")) : null,
    notes: sampleLine ? sampleLine.trim() : "",
  };
}

export async function claudeParse(text, order, apiKey) {
  if (!apiKey) return null;

  const prompt =
    `A supplier on Alibaba replied to a request for a quote on "${order.product}" ` +
    `(requested quantity: ${order.qty || "unspecified"}).\n\n` +
    "Extract these fields from the reply below and answer with ONLY a JSON object " +
    "with exactly these keys: unitPrice (number in USD or null), moq (number or null), " +
    'leadTime (short string or null), shipping (total shipping cost in USD as a number, ' +
    'or null), notes (short string with any other relevant detail, or "").\n\n' +
    `Supplier reply:\n"""\n${text}\n"""`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    console.error("Claude API error:", res.status, await res.text().catch(() => ""));
    return null;
  }

  const data = await res.json();
  const raw = data.content?.[0]?.text ?? "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]);
  } catch (e) {
    return null;
  }
}

export function computeQuote({ unitPrice, moq, leadTime, shipping, notes }, order, marginPercent) {
  const qty = Number(order.qty) || null;
  const shippingPerUnit = shipping && qty ? shipping / qty : 0;
  const costUnit = (unitPrice || 0) + shippingPerUnit;
  const finalUnit = costUnit * (1 + marginPercent / 100);
  const finalTotal = qty ? finalUnit * qty : null;
  const belowMoq = Boolean(moq && qty && qty < moq);

  return { unitPrice, moq, leadTime, shipping, notes, qty, finalUnit, finalTotal, belowMoq };
}

export function buildCustomerMessage(order, quote) {
  const qtyLine = quote.qty ? ` (${quote.qty} unidades)` : "";
  const totalLine = quote.finalTotal ? `\n- Total estimado: USD ${quote.finalTotal.toFixed(2)}` : "";
  const notesLine = quote.notes ? `\n- Detalle: ${quote.notes}` : "";
  const leadLine = quote.leadTime || "a confirmar con el proveedor";
  const moqLine = quote.belowMoq
    ? `\n\n(Nota interna: el proveedor pide un minimo de ${quote.moq} unidades, por encima de lo pedido.)`
    : "";

  return (
    `Hola! Te paso la cotización de "${order.product}"${qtyLine}:\n\n` +
    `- Precio unitario: USD ${quote.finalUnit.toFixed(2)}${totalLine}\n` +
    `- Tiempo de entrega estimado: ${leadLine}${notesLine}\n\n` +
    `Cualquier consulta quedo atento. Saludos!${moqLine}`
  );
}
