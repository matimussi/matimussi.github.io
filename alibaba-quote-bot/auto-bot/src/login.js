// Login manual, UNA vez (o cada vez que Alibaba vuelva a desafiar la sesion).
//
// No hay forma limpia de automatizar esto de punta a punta: Alibaba le pide
// captcha/verificacion al login casi siempre que detecta un browser nuevo o
// una IP de servidor. Este script abre un Chrome real, vos entras a mano
// (usuario, contraseña, y el captcha/verificacion si aparece) y una vez
// logueado guarda la sesion en auth-state.json para que el resto del bot
// la reutilice sin volver a pedir nada, hasta que Alibaba la desafie de
// nuevo (ahi hay que correr este script otra vez).
//
// No se intenta resolver el captcha en automatico. Eso ya no es "automatizar
// tu propia cuenta", es evadir una proteccion de seguridad de la plataforma,
// y no lo vamos a hacer.

import { chromium } from "playwright";
import { existsSync } from "node:fs";
import readline from "node:readline/promises";

const AUTH_STATE_PATH = new URL("../auth-state.json", import.meta.url).pathname;

async function main() {
  console.log("Abriendo Chrome. Logueate con tu cuenta real de Alibaba");
  console.log("(resolvé el captcha/verificación si aparece) y despues volvé");
  console.log("a esta terminal y apretá Enter.\n");

  const browser = await chromium.launch({ headless: false });
  const context = existsSync(AUTH_STATE_PATH)
    ? await browser.newContext({ storageState: AUTH_STATE_PATH })
    : await browser.newContext();
  const page = await context.newPage();
  await page.goto("https://login.alibaba.com/", { waitUntil: "domcontentloaded" });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question("Presioná Enter cuando ya estés logueado en Alibaba... ");
  rl.close();

  await context.storageState({ path: AUTH_STATE_PATH });
  console.log(`\nSesión guardada en ${AUTH_STATE_PATH}`);
  console.log("El bot va a reusar esta sesión hasta que Alibaba la desafíe de nuevo.");

  await browser.close();
}

main().catch((err) => {
  console.error("Error en el login:", err.message);
  process.exit(1);
});
