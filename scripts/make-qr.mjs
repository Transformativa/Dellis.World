// Makes assets/qr.svg for the URL in apps.json. Run: npm i --no-save qrcode && node scripts/make-qr.mjs
import { readFile, writeFile } from "node:fs/promises";
import QRCode from "qrcode";
const cfg = JSON.parse(await readFile(new URL("../apps.json", import.meta.url), "utf8"));
const svg = await QRCode.toString(cfg.siteUrl, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#232323", light: "#ffffff" } });
await writeFile(new URL("../assets/qr.svg", import.meta.url), svg);
console.log("Wrote assets/qr.svg for", cfg.siteUrl);
