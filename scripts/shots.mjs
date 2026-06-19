import puppeteer from "puppeteer";
import fs from "node:fs";

const BASE = process.env.BASE || "http://localhost:4173";
const OUT = "screenshots";
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGES = [
  { path: "/", name: "01-dashboard" },
  { path: "/autopilot", name: "02-autopilot", wait: 4000 },
  { path: "/optimizer", name: "03-optimizer" },
  { path: "/montecarlo", name: "04-montecarlo" },
  { path: "/regime", name: "05-regime" },
  { path: "/research", name: "06-research" },
  { path: "/strategies", name: "07-strategies" },
  { path: "/lab", name: "08-backtest" },
  { path: "/prop", name: "09-propfirm" },
  { path: "/learn", name: "10-knowledge" },
];

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--force-color-profile=srgb"],
});

// ---- Desktop ----
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
for (const p of PAGES) {
  await page.goto(`${BASE}${p.path}`, { waitUntil: "networkidle2", timeout: 30000 });
  await sleep(p.wait ?? 1800); // let charts + RTL layout settle
  await page.screenshot({ path: `${OUT}/${p.name}.png`, fullPage: true });
  console.log("captured", p.name);
}

// ---- Mobile (responsive + bottom nav) ----
const m = await browser.newPage();
await m.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true });
for (const p of [{ path: "/", name: "09-mobile-dashboard" }, { path: "/autopilot", name: "10-mobile-autopilot", wait: 4000 }]) {
  await m.goto(`${BASE}${p.path}`, { waitUntil: "networkidle2", timeout: 30000 });
  await sleep(p.wait ?? 2000);
  await m.screenshot({ path: `${OUT}/${p.name}.png`, fullPage: false });
  console.log("captured", p.name);
}

await browser.close();
console.log("done");
