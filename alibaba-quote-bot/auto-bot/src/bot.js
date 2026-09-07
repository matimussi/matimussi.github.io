// Orquestador principal. Dos modos:
//
//   node src/bot.js run            -> busca proveedores para cada pedido
//                                      pendiente, filtra por verificado +
//                                      reviews, y les escribe.
//   node src/bot.js check-replies  -> revisa si algun proveedor ya contactado
//                                      respondio, interpreta la respuesta y
//                                      arma la cotizacion final del cliente.
//
// IMPORTANTE - selectores sin verificar en produccion:
// Los selectores de DOM marcados con "// TODO verificar selector" son la
// mejor aproximacion a la estructura tipica de alibaba.com, pero no pudieron
// probarse contra el sitio real: el entorno donde se escribio este bot no
// tiene una sesion logueada de Alibaba y las paginas de busqueda publicas
// devuelven un captcha ante cualquier request. Antes de usar esto en serio,
// corré una vez con DRY_RUN=true y HEADLESS=false, mirá qué hace el browser,
// y ajustá los selectores que fallen contra el HTML real que veas.

import "dotenv/config";
import { chromium } from "playwright";
import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync, appendFileSync, mkdirSync } from "node:fs";
import { heuristicParse, claudeParse, computeQuote, buildCustomerMessage } from "./parse.js";

const ROOT = new URL("..", import.meta.url).pathname;
const AUTH_STATE_PATH = `${ROOT}auth-state.json`;
const STATE_PATH = `${ROOT}state.json`;
const LOG_PATH = `${ROOT}logs/activity.jsonl`;

const DRY_RUN = (process.env.DRY_RUN ?? "true") !== "false";
const MIN_RATING = Number(process.env.MIN_RATING ?? "4.5");
const MIN_REVIEWS = Number(process.env.MIN_REVIEWS ?? "20");
const MAX_SUPPLIERS_PER_ORDER = Number(process.env.MAX_SUPPLIERS_PER_ORDER ?? "3");
const MARGIN_PERCENT = Number(process.env.DEFAULT_MARGIN_PERCENT ?? "25");
const HEADLESS = process.env.HEADLESS !== "false";

function loadState() {
  if (!existsSync(STATE_PATH)) return { contacted: {} };
  return JSON.parse(readFileSync(STATE_PATH, "utf8"));
}

function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function log(event) {
  mkdirSync(`${ROOT}logs`, { recursive: true });
  appendFileSync(LOG_PATH, JSON.stringify({ ts: new Date().toISOString(), ...event }) + "\n");
}

function readOrders(dir) {
  const full = `${ROOT}orders/${dir}/`;
  if (!existsSync(full)) return [];
  return readdirSync(full)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ file: `${full}${f}`, order: JSON.parse(readFileSync(`${full}${f}`, "utf8")) }));
}

async function requireLoggedInContext(browser) {
  if (!existsSync(AUTH_STATE_PATH)) {
    throw new Error('No hay sesion guardada. Corré primero "npm run login".');
  }
  const context = await browser.newContext({ storageState: AUTH_STATE_PATH });
  const page = await context.newPage();
  await page.goto("https://www.alibaba.com/", { waitUntil: "domcontentloaded" });

  // TODO verificar selector: este chequeo de "estoy logueado" es una
  // aproximacion (busca un link de logout/cuenta). Si Alibaba cambia el
  // header, hay que actualizar esto.
  const loggedIn = await page
    .locator('a[href*="logout"], [class*="user-info"], [class*="member-info"]')
    .first()
    .isVisible()
    .catch(() => false);

  if (!loggedIn) {
    await context.close();
    throw new Error(
      'La sesion guardada ya no es valida (Alibaba probablemente la desafio de nuevo). Corré "npm run login" otra vez.'
    );
  }

  return { context, page };
}

function buildRfqMessage(order) {
  const qtyLine = order.qty
    ? `We are looking to order approximately ${order.qty} units.`
    : "Could you share your price breaks for different order quantities?";
  const specsLine = order.specs ? `\nSpecifications requested: ${order.specs}\n` : "\n";
  return (
    "Hello,\n\n" +
    `I am interested in your "${order.product}".\n` +
    qtyLine +
    specsLine +
    "\nCould you please confirm:\n" +
    "- Minimum order quantity (MOQ)\n" +
    "- Unit price (FOB) at that quantity\n" +
    "- Estimated production/lead time\n" +
    "- Whether a sample is available before the full order\n" +
    `- Shipping options and cost to ${order.dest || "our country"}\n\n` +
    "Thank you, looking forward to your quotation."
  );
}

async function findVerifiedSuppliers(page, order) {
  const searchUrl = `https://www.alibaba.com/trade/search?SearchText=${encodeURIComponent(order.product)}`;
  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

  // TODO verificar selector: intenta tildar los filtros "Verified Supplier"
  // y "Trade Assurance" de la barra lateral. Los textos/checkboxes reales
  // pueden variar segun el layout que te muestre Alibaba.
  const filterLabels = [/verified supplier/i, /trade assurance/i];
  for (const label of filterLabels) {
    const filterEl = page.locator("label,span").filter({ hasText: label }).first();
    if (await filterEl.isVisible().catch(() => false)) {
      await filterEl.click().catch(() => {});
      await page.waitForTimeout(1000);
    }
  }

  // TODO verificar selector: tarjetas de resultado y sus campos de
  // rating/reviews/link. Esto asume una estructura similar a search.js.
  const cards = page.locator('[class*="search-card"], [class*="fy23-search-card"]');
  const count = Math.min(await cards.count(), 20);

  const candidates = [];
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const link = await card.locator("a").first().getAttribute("href").catch(() => null);
    const ratingText = await card.locator('[class*="rating"], [class*="score"]').first().innerText().catch(() => null);
    const reviewsText = await card.locator('[class*="review"]').first().innerText().catch(() => null);
    const verifiedBadge = await card.locator('text=/verified supplier/i').first().isVisible().catch(() => false);

    if (!link) continue;
    const rating = ratingText ? parseFloat(ratingText.replace(/[^\d.]/g, "")) : null;
    const reviews = reviewsText ? parseInt(reviewsText.replace(/[^\d]/g, ""), 10) : null;

    candidates.push({
      url: link.startsWith("http") ? link : `https:${link}`,
      rating,
      reviews,
      verified: verifiedBadge,
    });
  }

  return candidates
    .filter((c) => c.verified && c.rating != null && c.reviews != null)
    .filter((c) => c.rating >= MIN_RATING && c.reviews >= MIN_REVIEWS)
    .sort((a, b) => b.rating * Math.log(b.reviews + 1) - a.rating * Math.log(a.reviews + 1))
    .slice(0, MAX_SUPPLIERS_PER_ORDER);
}

async function contactSupplier(context, supplierUrl, message) {
  const page = await context.newPage();
  await page.goto(supplierUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

  // TODO verificar selector: boton para abrir el chat del proveedor.
  const chatButton = page.locator('text=/chat now|contact supplier/i').first();
  await chatButton.click({ timeout: 10000 });
  await page.waitForTimeout(1500);

  // TODO verificar selector: campo de texto del chat.
  const chatInput = page.locator('textarea, [contenteditable="true"]').first();
  await chatInput.fill(message);

  if (DRY_RUN) {
    log({ type: "would_contact", supplierUrl, message });
    await page.close();
    return { sent: false };
  }

  // TODO verificar selector: boton de enviar del chat.
  await page.locator('button:has-text("Send")').first().click({ timeout: 10000 });
  log({ type: "contacted", supplierUrl, message });
  await page.close();
  return { sent: true };
}

async function runPendingOrders() {
  const pending = readOrders("pending");
  if (!pending.length) {
    console.log("No hay pedidos pendientes en orders/pending/.");
    return;
  }

  const browser = await chromium.launch({ headless: HEADLESS });
  const { context, page } = await requireLoggedInContext(browser);
  const state = loadState();

  for (const { file, order } of pending) {
    console.log(`\nProcesando pedido ${order.id} (${order.product})`);
    const candidates = await findVerifiedSuppliers(page, order);

    if (!candidates.length) {
      console.log("  No se encontraron proveedores verificados con suficientes reviews. Se deja el pedido pendiente para revisar a mano.");
      log({ type: "no_candidates", orderId: order.id, product: order.product });
      continue;
    }

    const message = buildRfqMessage(order);
    const contacted = [];

    for (const candidate of candidates) {
      const key = `${order.id}::${candidate.url}`;
      if (state.contacted[key]) continue;

      try {
        const result = await contactSupplier(context, candidate.url, message);
        state.contacted[key] = { at: new Date().toISOString(), dryRun: DRY_RUN };
        contacted.push({ ...candidate, sent: result.sent });
        console.log(`  ${DRY_RUN ? "[DRY RUN] Simularía contactar" : "Contactó"} a ${candidate.url}`);
      } catch (e) {
        console.log(`  Error al contactar ${candidate.url}: ${e.message}`);
        log({ type: "contact_error", orderId: order.id, supplierUrl: candidate.url, error: e.message });
      }
    }

    saveState(state);
    order.contactedSuppliers = contacted;
    order.contactedAt = new Date().toISOString();

    const destDir = `${ROOT}orders/awaiting-reply/`;
    mkdirSync(destDir, { recursive: true });
    writeFileSync(`${destDir}${order.id}.json`, JSON.stringify(order, null, 2));
    unlinkSync(file);
  }

  await context.close();
  await browser.close();
}

async function checkReplies() {
  const awaiting = readOrders("awaiting-reply");
  if (!awaiting.length) {
    console.log("No hay pedidos esperando respuesta en orders/awaiting-reply/.");
    return;
  }

  const browser = await chromium.launch({ headless: HEADLESS });
  const { context, page } = await requireLoggedInContext(browser);

  // TODO verificar selector/URL: centro de mensajes de Alibaba.
  await page.goto("https://message.alibaba.com/", { waitUntil: "domcontentloaded" }).catch(() => {});

  for (const { file, order } of awaiting) {
    for (const supplier of order.contactedSuppliers || []) {
      // TODO verificar selector: como ubicar la conversacion con este
      // proveedor puntual y extraer su ultimo mensaje.
      const thread = page.locator(`text=${supplier.url}`).first();
      const hasThread = await thread.isVisible().catch(() => false);
      if (!hasThread) continue;

      await thread.click().catch(() => {});
      const lastMessage = await page
        .locator('[class*="message-content"], [class*="chat-bubble"]')
        .last()
        .innerText()
        .catch(() => null);

      if (!lastMessage) continue;

      console.log(`\nRespuesta de ${supplier.url}:\n${lastMessage}\n`);

      let extracted = await claudeParse(lastMessage, order, process.env.ANTHROPIC_API_KEY).catch(() => null);
      let source = "claude";
      if (!extracted) {
        extracted = heuristicParse(lastMessage);
        source = "heuristic";
      }

      const quote = computeQuote(extracted, order, MARGIN_PERCENT);
      const customerMessage = buildCustomerMessage(order, quote);

      const quoteRecord = {
        orderId: order.id,
        supplierUrl: supplier.url,
        source,
        extracted,
        quote,
        customerMessage,
        generatedAt: new Date().toISOString(),
      };

      mkdirSync(`${ROOT}logs/quotes-ready`, { recursive: true });
      writeFileSync(`${ROOT}logs/quotes-ready/${order.id}.json`, JSON.stringify(quoteRecord, null, 2));
      log({ type: "quote_ready", ...quoteRecord });

      console.log("--- Cotización lista para el cliente ---");
      console.log(customerMessage);
      console.log(`\n(Guardada en logs/quotes-ready/${order.id}.json — todavía tenés que mandársela vos al cliente por el canal que uses con él.)`);

      const destDir = `${ROOT}orders/done/`;
      mkdirSync(destDir, { recursive: true });
      writeFileSync(`${destDir}${order.id}.json`, JSON.stringify(order, null, 2));
      unlinkSync(file);
      break;
    }
  }

  await context.close();
  await browser.close();
}

const command = process.argv[2];
if (command === "run") {
  runPendingOrders().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
} else if (command === "check-replies") {
  checkReplies().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
} else {
  console.log("Uso: node src/bot.js run | node src/bot.js check-replies");
  process.exit(1);
}
