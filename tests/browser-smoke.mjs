import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const baseUrl = process.env.APP_URL || "http://127.0.0.1:4173";
const artifactDir = fileURLToPath(new URL("../test-artifacts/", import.meta.url));
await mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true,
});
const consoleProblems = [];

async function preparePage(viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) consoleProblems.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => consoleProblems.push(`pageerror: ${error.message}`));
  await page.addInitScript(() => localStorage.removeItem("food-compass-v1"));
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  return page;
}

const mobile = await preparePage({ width: 390, height: 844 });
const manifest = await mobile.evaluate(async () => (await fetch("/manifest.webmanifest")).json());
assert.equal(manifest.display, "standalone", "Manifest 应以独立应用模式打开");
assert.equal(manifest.icons.some((item) => item.sizes === "192x192"), true, "Manifest 应包含 192 图标");
assert.equal(manifest.icons.some((item) => item.sizes === "512x512"), true, "Manifest 应包含 512 图标");
await mobile.evaluate(() => navigator.serviceWorker.ready);
assert.equal(await mobile.evaluate(() => Boolean(navigator.serviceWorker.controller)), true, "Service Worker 应接管页面");
assert.equal(await mobile.locator(".meal-ticket").count(), 3, "首页应展示三张推荐餐签");
assert.equal(await mobile.getByRole("heading", { name: "美食指南针" }).count(), 1);
assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "手机端不应横向溢出");
assert.equal(
  await mobile.evaluate(() => performance.getEntriesByType("resource").some((entry) => entry.name.includes("canteen-reference.jpg"))),
  true,
  "风格参考图应成功加载",
);

await mobile.screenshot({ path: join(artifactDir, "mobile-home.png"), fullPage: true });

await mobile.locator('[data-action="choose-store"]').first().click();
await mobile.locator(".pending-strip").waitFor();
assert.match(await mobile.locator(".pending-strip").innerText(), /待确认|最后吃了/);

await mobile.locator('[data-action="confirm-pending"]').click();
await mobile.getByRole("heading", { name: "吃过的" }).waitFor();
assert.equal(await mobile.locator(".timeline-entry").count(), 1, "饭后确认应生成一条历史记录");

await mobile.locator('[data-action="navigate"][data-view="stores"]').click();
await mobile.getByRole("heading", { name: "店铺库" }).waitFor();
const storeCountBefore = await mobile.evaluate(() => JSON.parse(localStorage.getItem("food-compass-v1")).stores.length);
await mobile.locator('[data-action="add-store"]').click();
await mobile.locator('#store-form input[name="name"]').fill("测试新店");
await mobile.locator('#store-form select[name="area"]').selectOption("东二门");
await mobile.locator('#store-form input[name="price"]').fill("19");
await mobile.locator('#store-form input[name="location"]').fill("东二门测试位置");
await mobile.locator('#store-form input[name="category"]').fill("盖饭");
const formValidity = await mobile.locator("#store-form").evaluate((form) => ({
  valid: form.checkValidity(),
  invalidFields: [...form.elements].filter((field) => field.willValidate && !field.checkValidity()).map((field) => field.name),
}));
assert.equal(formValidity.valid, true, `新增店铺表单应有效：${formValidity.invalidFields.join(",")}`);
await mobile.locator('#store-form button[type="submit"]').click();
assert.deepEqual(consoleProblems, [], `保存店铺时控制台不应报错：${consoleProblems.join("\n")}`);
const storeCountAfter = await mobile.evaluate(() => JSON.parse(localStorage.getItem("food-compass-v1")).stores.length);
assert.equal(storeCountAfter, storeCountBefore + 1, "保存后本地店铺数据应增加一条");
await mobile.locator("#store-search").fill("测试新店");
assert.equal(await mobile.locator("#store-search").inputValue(), "测试新店", "搜索框应保留完整查询词");
assert.equal(await mobile.locator(".store-row:visible").count(), 1, "新增店铺应可被搜索到");
await mobile.screenshot({ path: join(artifactDir, "mobile-stores.png"), fullPage: true });
await mobile.context().setOffline(true);
await mobile.reload({ waitUntil: "domcontentloaded" });
await mobile.getByRole("heading", { name: "美食指南针" }).waitFor();
assert.equal(await mobile.locator(".meal-ticket").count(), 3, "断网重载后应用仍应可用");
await mobile.context().setOffline(false);

const ios = await browser.newPage({
  viewport: { width: 390, height: 844 },
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
});
await ios.goto(baseUrl, { waitUntil: "networkidle" });
await ios.getByRole("button", { name: "安装" }).click();
assert.equal(await ios.getByRole("dialog", { name: "放到手机桌面" }).isVisible(), true, "iPhone 应显示手动安装步骤");
await ios.screenshot({ path: join(artifactDir, "ios-install.png"), fullPage: true });
await ios.close();

const desktop = await preparePage({ width: 1440, height: 1000 });
assert.equal(await desktop.locator(".meal-ticket").count(), 3);
assert.equal(await desktop.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "桌面端不应横向溢出");
await desktop.screenshot({ path: join(artifactDir, "desktop-home.png"), fullPage: true });

assert.deepEqual(consoleProblems, [], `控制台应保持干净：${consoleProblems.join("\n")}`);

console.log(JSON.stringify({
  mobile: { viewport: "390x844", cards: 3, historyConfirmed: true, storeAdded: true, horizontalOverflow: false, serviceWorker: true, offlineReload: true },
  ios: { viewport: "390x844", installGuide: true },
  desktop: { viewport: "1440x1000", cards: 3, horizontalOverflow: false },
  consoleProblems: consoleProblems.length,
}, null, 2));

await browser.close();
