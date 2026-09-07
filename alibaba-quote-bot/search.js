// Prototipo de "cotizador" automatico.
//
// Flujo: el cliente pide un producto -> este script busca ese producto en las
// paginas PUBLICAS de resultados de Alibaba (sin login, sin contactar a nadie)
// -> extrae precio y MOQ (cantidad minima de pedido) de cada listado ->
// arma un rango estimado para pasarle al cliente.
//
// Limitaciones a tener en cuenta (ver README.md):
// - Alibaba puede mostrar un captcha/verificacion si detecta trafico
//   automatizado. Cuando pasa, este script lo informa en vez de fallar en
//   silencio.
// - El HTML de Alibaba cambia con frecuencia, asi que los selectores pueden
//   quedar desactualizados y hay que ajustarlos.
// - Esto NO contacta proveedores ni pide cotizacion formal: solo lee el
//   precio/MOQ que el proveedor ya dejo publicado en el listado.

import { chromium } from "playwright";

const CHROME_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

function parsePriceRange(text) {
  if (!text) return null;
  const numbers = text.replace(/,/g, "").match(/\d+(\.\d+)?/g);
  if (!numbers) return null;
  const values = numbers.map(Number);
  return { min: Math.min(...values), max: Math.max(...values), raw: text.trim() };
}

function parseMoq(text) {
  if (!text) return null;
  const match = text.replace(/,/g, "").match(/\d+/);
  return match ? { units: Number(match[0]), raw: text.trim() } : null;
}

async function searchAlibaba(query, { limit = 10 } = {}) {
  const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    proxy: proxyServer ? { server: proxyServer } : undefined,
    // El entorno de desarrollo intercepta TLS con un proxy propio (ver
    // NODE_EXTRA_CA_CERTS); Chromium no lee esa variable, asi que sin esto
    // el proxy corta la conexion. Quitar este flag fuera de este sandbox.
    args: proxyServer ? ["--ignore-certificate-errors"] : [],
  });

  try {
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });

    const url = `https://www.alibaba.com/trade/search?SearchText=${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Alibaba a veces interpone un checkpoint anti-bot antes de mostrar resultados.
    const blocked = await page
      .locator("text=/verify|captcha|checkpoint/i")
      .first()
      .isVisible()
      .catch(() => false);
    if (blocked) {
      return { blocked: true, url, items: [] };
    }

    await page.waitForSelector('[class*="search-card"], [class*="fy23-search-card"]', {
      timeout: 15000,
    }).catch(() => {});

    const cards = page.locator('[class*="search-card"], [class*="fy23-search-card"]');
    const count = Math.min(await cards.count(), limit);

    const items = [];
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const title = await card.locator('h2, [class*="title"]').first().innerText().catch(() => null);
      const priceText = await card.locator('[class*="price"]').first().innerText().catch(() => null);
      const moqText = await card.locator('text=/min\\. order|piece|units/i').first().innerText().catch(() => null);
      const supplier = await card.locator('[class*="supplier"], [class*="company"]').first().innerText().catch(() => null);
      const link = await card.locator("a").first().getAttribute("href").catch(() => null);

      if (title) {
        items.push({
          title: title.trim(),
          price: parsePriceRange(priceText),
          moq: parseMoq(moqText),
          supplier: supplier ? supplier.trim() : null,
          url: link ? (link.startsWith("http") ? link : `https:${link}`) : null,
        });
      }
    }

    return { blocked: false, url, items };
  } finally {
    await browser.close();
  }
}

function summarize(items) {
  const prices = items.map((i) => i.price).filter(Boolean);
  if (prices.length === 0) return null;
  return {
    min: Math.min(...prices.map((p) => p.min)),
    max: Math.max(...prices.map((p) => p.max)),
    listingsWithPrice: prices.length,
  };
}

async function main() {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    console.error('Uso: node search.js "nombre del producto"');
    process.exit(1);
  }

  console.log(`Buscando "${query}" en Alibaba (busqueda publica, sin login)...\n`);
  const result = await searchAlibaba(query);

  if (result.blocked) {
    console.log("Alibaba mostro una verificacion anti-bot y no se pudieron leer resultados.");
    console.log(`Revisar manualmente: ${result.url}`);
    return;
  }

  if (result.items.length === 0) {
    console.log("No se encontraron listados (o cambio el HTML de la pagina y hay que ajustar los selectores).");
    console.log(`URL buscada: ${result.url}`);
    return;
  }

  console.log(`Se encontraron ${result.items.length} listados:\n`);
  for (const item of result.items) {
    console.log(`- ${item.title}`);
    console.log(`  Proveedor: ${item.supplier ?? "N/D"}`);
    console.log(`  Precio: ${item.price ? item.price.raw : "N/D"}`);
    console.log(`  MOQ: ${item.moq ? item.moq.raw : "N/D"}`);
    console.log(`  Link: ${item.url ?? "N/D"}\n`);
  }

  const summary = summarize(result.items);
  if (summary) {
    console.log("--- Cotizacion estimada ---");
    console.log(`Rango de precio: USD ${summary.min} - ${summary.max} (basado en ${summary.listingsWithPrice} listados)`);
    console.log("Nota: esto es un estimado a partir de precios publicos. El precio final depende de cantidad, personalizacion y negociacion con el proveedor.");
  }
}

main().catch((err) => {
  console.error("Error inesperado:", err.message);
  process.exit(1);
});
