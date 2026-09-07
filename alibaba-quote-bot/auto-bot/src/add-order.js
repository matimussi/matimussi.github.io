// Uso: npm run add-order -- --product "auriculares bluetooth" --qty 500 --dest Argentina --specs "color negro"
import { writeFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, "");
    out[key] = argv[i + 1];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.product) {
  console.error('Falta --product. Ejemplo:\n  npm run add-order -- --product "auriculares bluetooth" --qty 500 --dest Argentina');
  process.exit(1);
}

const order = {
  id: randomUUID(),
  product: args.product,
  qty: args.qty ? Number(args.qty) : null,
  dest: args.dest || "",
  specs: args.specs || "",
  createdAt: new Date().toISOString(),
};

const dir = new URL("../orders/pending/", import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}${order.id}.json`, JSON.stringify(order, null, 2));

console.log(`Pedido cargado: ${order.id}`);
console.log('Corré "npm run run" para que el bot busque proveedores y les escriba.');
