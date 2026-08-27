/**
 * Browser end-to-end check.
 *
 * Requires:
 *   - the dev servers running (npm run dev)
 *   - a seeded database (npm run db:seed)
 *   - Chrome installed (uses puppeteer-core + the system Chrome)
 *
 * Run: node scripts/e2e-browser.mjs
 *
 * Each user gets an isolated browser context (separate storage), simulating
 * two real browsers. Interactions avoid puppeteer's mouse-click internals,
 * which can hang on this machine's headless Chrome with multiple tabs open.
 */
import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const CLIENT = process.env.CLIENT_URL ?? "http://localhost:5174";
const PASSWORD = "password123";
const SHOT_DIR = fileURLToPath(new URL("../.e2e-shots/", import.meta.url));

function findChrome() {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  return candidates.find((c) => {
    try {
      require("fs").accessSync(c);
      return true;
    } catch {
      return false;
    }
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** waitForFunction with interval polling (rAF stalls in background tabs). */
function waitForText(page, text, timeout = 30000) {
  return page.waitForFunction(
    (t) => document.body.textContent?.includes(t),
    { timeout, polling: 200 },
    text,
  );
}

function waitForEditorText(page, text, timeout = 30000) {
  return page.waitForFunction(
    (t) => document.querySelector(".ProseMirror")?.textContent?.includes(t),
    { timeout, polling: 200 },
    text,
  );
}

/** Fills the login form via native setters and submits via a DOM click. */
async function login(page, email) {
  await page.goto(`${CLIENT}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.evaluate(
    ({ email, password }) => {
      const setValue = (selector, value) => {
        const el = document.querySelector(selector);
        if (!el) return;
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )?.set;
        setter?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      };
      setValue('input[type="email"]', email);
      setValue('input[type="password"]', password);
    },
    { email, password: PASSWORD },
  );
  await page.evaluate(() => document.querySelector('button[type="submit"]')?.click());
  await waitForText(page, "Recent workspaces");
}

async function openWorkspace(page) {
  await page.goto(`${CLIENT}/`, { waitUntil: "domcontentloaded" });
  await waitForText(page, "Customer Onboarding");
  const clicked = await page.evaluate(() => {
    const card = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Customer Onboarding"),
    );
    card?.click();
    return Boolean(card);
  });
  if (!clicked) throw new Error("Workspace card not found");
  await waitForText(page, "Customer Onboarding Process");
  await waitForEditorText(page, "Customer Onboarding Process");
}

/** Opens the given right-panel tab (DOM click). */
async function openTab(page, label) {
  await page.evaluate((l) => {
    const tab = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(l));
    tab?.click();
  }, label);
}

let pages = []; // module-scope for failure diagnostics

async function main() {
  const executablePath = process.env.CHROME_PATH ?? findChrome();
  if (!executablePath) throw new Error("Chrome not found — install it or set CHROME_PATH");

  await fs.mkdir(SHOT_DIR, { recursive: true });
  const results = [];
  const check = (label, ok) => {
    results.push([label, ok]);
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  };
  const step = (label) => console.log(`… ${label}`);

  const browser = await puppeteer.launch({
    executablePath,
    headless: "new",
    protocolTimeout: 90000,
  });

  // Isolated contexts = separate localStorage per user (like two real browsers).
  const ctxA = await browser.createBrowserContext();
  const ctxB = await browser.createBrowserContext();
  const pageA = await ctxA.newPage();
  await pageA.setViewport({ width: 1440, height: 900 });
  const pageB = await ctxB.newPage();
  await pageB.setViewport({ width: 1440, height: 900 });
  pages = [pageA, pageB];

  step("signing in as Furqan and Ahmed");
  await login(pageA, "furqan@syncroom.dev");
  await login(pageB, "ahmed@syncroom.dev");
  check("Both users reach the dashboard", true);

  step("opening the Customer Onboarding workspace in both tabs");
  await openWorkspace(pageA);
  await openWorkspace(pageB);
  check("Furqan sees the document", true);
  check("Ahmed sees the document", true);

  step("checking presence");
  await waitForText(pageA, "Ahmed");
  check("Presence panel lists Ahmed", true);

  step("Furqan edits the document");
  await pageA.evaluate(() => document.querySelector(".ProseMirror")?.focus());
  await pageA.keyboard.press("End");
  await pageA.keyboard.type(" Live edit from Furqan.");
  await waitForText(pageA, "Saved");
  check("Save indicator reaches 'Saved'", true);

  const ahmedSeesIt = await pageB
    .waitForFunction(
      (t) => document.querySelector(".ProseMirror")?.textContent?.includes(t),
      { timeout: 30000, polling: 200 },
      "Live edit from Furqan",
    )
    .then(() => true)
    .catch(() => false);
  check("Furqan's edit appears live in Ahmed's tab", ahmedSeesIt);

  const readBadge = (page) =>
    page.evaluate(() => {
      const bell = document.querySelector('button[aria-label^="Notifications"]');
      const match = bell?.getAttribute("aria-label")?.match(/\((\d+) unread\)/);
      return match ? Number(match[1]) : 0;
    });
  const badgeBefore = await readBadge(pageA);

  step("Ahmed comments → Furqan sees it live");
  await openTab(pageB, "Comments");
  await waitForText(pageB, "No comments yet");
  await pageB.type("textarea", "@Furqan can you check this?");
  await pageB.keyboard.press("Enter");

  // Furqan opens the comments panel and should see Ahmed's comment arrive live.
  await openTab(pageA, "Comments");
  const furqanSeesComment = await pageA
    .waitForFunction(
      (t) => document.body.textContent?.includes(t),
      { timeout: 30000, polling: 200 },
      "@Furqan can you check this?",
    )
    .then(() => true)
    .catch(() => false);
  check("Furqan sees Ahmed's comment live", furqanSeesComment);

  step("mention notification arrives for Furqan");
  await openTab(pageA, "Active");
  // Ahmed's mention should push the unread badge up by at least one, live.
  const mentionArrived = await pageA
    .waitForFunction(
      (before) => {
        const bell = document.querySelector('button[aria-label^="Notifications"]');
        const match = bell?.getAttribute("aria-label")?.match(/\((\d+) unread\)/);
        return match ? Number(match[1]) > before : false;
      },
      { timeout: 20000, polling: 200 },
      badgeBefore,
    )
    .then(() => true)
    .catch(() => false);
  check("Furqan's mention notification arrives in real time", mentionArrived);

  await sleep(500);
  await pageA.screenshot({ path: `${SHOT_DIR}workspace-furqan.png` });
  await pageB.screenshot({ path: `${SHOT_DIR}workspace-ahmed.png` });
  console.log(`\nScreenshots: ${SHOT_DIR}`);

  const passed = results.filter(([, ok]) => ok).length;
  console.log(`\n${passed}/${results.length} browser checks passed`);

  await browser.close();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(async (err) => {
  console.error("E2E FAILED:", err.message);
  for (const [i, page] of pages.entries()) {
    try {
      const url = await page.evaluate(() => location.href);
      const text = await page.evaluate(() => document.body.textContent.slice(0, 300));
      console.log(`  [tab${i}] url: ${url}`);
      console.log(`  [tab${i}] body: ${JSON.stringify(text)}`);
    } catch {
      // page already closed
    }
  }
  process.exit(1);
});
