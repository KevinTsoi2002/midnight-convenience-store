import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const htmlUrl = new URL("../midnight-convenience-store.html", import.meta.url).href;
const evidenceDir = fileURLToPath(new URL("../output/playwright/", import.meta.url));
let browser;

before(async () => {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  await mkdir(evidenceDir, { recursive: true });
});

after(async () => {
  await browser?.close();
});

test("artifact: one complete HTML, valid script and no external dependencies", async () => {
  const html = await readFile(new URL(htmlUrl), "utf8");
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<\/html>\s*$/);
  assert.doesNotMatch(html, /(?:src|href)\s*=\s*["']https?:\/\/|<script[^>]+src=|@import|__midnightStore/);
  assert.match(html, /<link rel="icon" href="data:image\/svg\+xml,/);
  assert.doesNotMatch(html, /TODO|TBD|FIXME/);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  new vm.Script(scripts[0][1]);
});

async function withPage(run, options = {}) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    ...options
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await run(page, context);
    assert.deepEqual(errors, [], "No uncaught page errors");
  } finally {
    await context.close();
  }
}

async function start(page) {
  await page.goto(htmlUrl);
  await page.getByRole("button", { name: "开始值班", exact: true }).click();
}

async function startRun(page, seed = 20261009) {
  await page.goto(`${htmlUrl}?seed=${seed}`);
  await page.getByRole("button", { name: "开始新一局", exact: true }).click();
}

async function finishRunDay(page, expectedCount) {
  assert.equal(await page.locator("[data-daily-customer]").count(), expectedCount);
  await page.getByRole("button", { name: "开始营业", exact: true }).click();
  for (let index = 0; index < expectedCount; index += 1) {
    const ids = await page.locator("[data-product-card]:not([disabled])").evaluateAll((cards) => cards.slice(0, 3).map((card) => card.dataset.productId));
    for (const id of ids) await page.locator(`[data-product-id="${id}"]`).click();
    await page.getByRole("button", { name: "装袋", exact: true }).click();
    await page.getByRole("button", { name: "继续", exact: true }).click();
  }
  assert.equal(await page.locator("[data-screen-panel=\"settlement\"]").isVisible(), true);
}

async function serve(page, ids) {
  for (const id of ids) {
    await page.locator(`[data-product-id="${id}"]`).click();
  }
  await page.getByRole("button", { name: "装袋", exact: true }).click();
  assert.equal(await page.locator("[data-feedback]").isVisible(), true);
  await page.getByRole("button", { name: "继续", exact: true }).click();
}

test("offline entry: complete intro and zero network dependencies", async () => {
  await withPage(async (page, context) => {
    await context.setOffline(true);
    const networkRequests = [];
    page.on("request", (request) => {
      if (/^https?:/.test(request.url())) networkRequests.push(request.url());
    });
    await page.goto(htmlUrl);
    assert.equal(await page.title(), "凌晨 2:17 的便利店");
    assert.equal(await page.locator('[data-screen-panel="intro"]').isVisible(), true);
    assert.equal(await page.getByRole("button", { name: "开始值班", exact: true }).isVisible(), true);
    assert.equal(await page.locator("[data-product-grid]").isVisible(), false);
    await page.screenshot({ path: path.join(evidenceDir, "intro-desktop.png") });
    await page.getByRole("button", { name: "开始值班", exact: true }).click();
    assert.equal(await page.locator("[data-product-card]").count(), 9);
    assert.deepEqual(networkRequests, []);
  });
});

test("roguelite: seeded three-day loop exposes events, settlement and trinkets", async () => {
  await withPage(async (page) => {
    await startRun(page);
    const expectedClock = await page.evaluate(() => new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()));
    assert.equal(await page.locator("[data-real-clock]").first().innerText(), expectedClock);
    assert.equal(await page.locator("[data-run-day]").first().innerText(), "第 1 天");
    assert.equal(await page.locator("[data-night-event]").isVisible(), true);
    const firstCustomers = await page.locator("[data-daily-customer]").evaluateAll((nodes) => nodes.map((node) => node.dataset.customerId));
    assert.equal(firstCustomers.length, 3);
    await finishRunDay(page, 3);
    assert.equal(await page.locator("[data-help-rate]").isVisible(), true);
    await page.getByRole("button", { name: "继续到饰品", exact: true }).click();
    assert.equal(await page.locator('[data-screen-panel="trinket-reward"] [data-trinket-choice]').count(), 3);
    await page.locator('[data-screen-panel="trinket-reward"] [data-trinket-choice]').first().click();
    await page.getByRole("button", { name: "装备", exact: true }).last().click();
    await page.getByRole("button", { name: "进入下一天", exact: true }).click();
    assert.equal(await page.locator("[data-run-day]").first().innerText(), "第 2 天");
    await finishRunDay(page, 4);
    await page.getByRole("button", { name: "继续到饰品", exact: true }).click();
    assert.equal(await page.locator("[data-trinket-choice]").count(), 3);
    assert.match(await page.locator("[data-quality-range]").last().innerText(), /common|rare|epic|legendary|普通|稀有|史诗|传说/);
    await page.locator("[data-trinket-choice]").first().click();
    await page.getByRole("button", { name: "装备", exact: true }).last().click();
    await page.getByRole("button", { name: "进入下一天", exact: true }).click();
    assert.equal(await page.locator("[data-run-day]").first().innerText(), "第 3 天");
    await finishRunDay(page, 5);
    await page.getByRole("button", { name: "查看今晚结局", exact: true }).click();
    assert.equal(await page.locator('[data-screen-panel="trinket-reward"] [data-trinket-choice]').count(), 3);
    await page.locator('[data-screen-panel="trinket-reward"] [data-trinket-choice]').first().click();
    await page.getByRole("button", { name: "放弃", exact: true }).click();
    assert.equal(await page.locator('[data-screen-panel="ending"]').isVisible(), true);
    assert.equal(await page.locator(".ending-receipt .receipt-line").count(), 12);
  });
});

test("roguelite: mobile overlays stay within the viewport", async () => {
  await withPage(async (page) => {
    await startRun(page, 20261009);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await finishRunDay(page, 3);
    const settlement = await page.locator("[data-screen-panel=\"settlement\"]").boundingBox();
    assert.equal(settlement.x >= 0 && settlement.x + settlement.width <= 390, true);
    await page.getByRole("button", { name: "继续到饰品", exact: true }).click();
    const reward = await page.locator("[data-screen-panel=\"trinket-reward\"]").boundingBox();
    assert.equal(reward.x >= 0 && reward.x + reward.width <= 390, true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }, { viewport: { width: 390, height: 844 } });
});

test("night dialogue: selection updates coverage and submission preserves scored feedback", async () => {
  await withPage(async (page) => {
    await startRun(page);
    await page.getByRole("button", { name: "开始营业", exact: true }).click();
    const dialogue = page.locator("[data-night-dialogue]");
    const initial = await dialogue.innerText();
    assert.match(initial, /线索|观察/);
    assert.match(initial, /尚未覆盖/);
    await page.locator("[data-product-card]:not([disabled])").first().click();
    assert.notEqual(await dialogue.innerText(), initial);
    assert.match(await dialogue.innerText(), /已装入|覆盖标签/);
    const ids = await page.locator("[data-product-card]:not([disabled]):not(.is-selected)").evaluateAll((cards) => cards.slice(0, 2).map((card) => card.dataset.productId));
    for (const id of ids) await page.locator(`[data-product-id="${id}"]`).click();
    await page.getByRole("button", { name: "装袋", exact: true }).click();
    const feedback = await dialogue.innerText();
    assert.match(feedback, /显性需求|隐藏需求/);
    assert.match(feedback, /分数.*连击/);
    assert.notEqual(feedback, initial);
  });
});

test("trinket drawer: draft can be stored, equipped later and unequipped", async () => {
  await withPage(async (page) => {
    await startRun(page);
    await finishRunDay(page, 3);
    await page.getByRole("button", { name: "继续到饰品", exact: true }).click();
    await page.locator("[data-trinket-choice]").first().click();
    assert.equal(await page.locator("[data-trinket-action-panel]").isVisible(), true);
    await page.getByRole("button", { name: "放入背包", exact: true }).click();
    assert.equal(await page.locator("[data-inventory-count]").innerText(), "1 / 8");
    assert.equal(await page.locator("[data-equipped-count]").innerText(), "0 / 3");
    await page.getByRole("button", { name: "装备", exact: true }).click();
    assert.equal(await page.locator("[data-equipped-count]").innerText(), "1 / 3");
    await page.getByRole("button", { name: "卸下", exact: true }).click();
    assert.equal(await page.locator("[data-equipped-count]").innerText(), "0 / 3");
    await page.getByRole("button", { name: "进入下一天", exact: true }).click();
    assert.equal(await page.locator("[data-run-day]").first().innerText(), "第 2 天");
  });
});

test("trinket drawer: completing one candidate locks the other candidates", async () => {
  await withPage(async (page) => {
    await startRun(page);
    await finishRunDay(page, 3);
    await page.getByRole("button", { name: "继续到饰品", exact: true }).click();
    const choices = page.locator("[data-trinket-choice]");
    await choices.first().click();
    await page.getByRole("button", { name: "放入背包", exact: true }).click();
    assert.equal(await choices.count(), 3);
    assert.equal(await choices.evaluateAll((buttons) => buttons.every((button) => button.disabled)), true);
    assert.equal(await page.locator("[data-inventory-count]").innerText(), "1 / 8");
  });
});

test("trinket drawer: abandoning a draft advances without adding it", async () => {
  await withPage(async (page) => {
    await startRun(page);
    await finishRunDay(page, 3);
    await page.getByRole("button", { name: "继续到饰品", exact: true }).click();
    await page.locator("[data-trinket-choice]").first().click();
    await page.getByRole("button", { name: "放弃", exact: true }).click();
    assert.equal(await page.locator("[data-run-day]").first().innerText(), "第 2 天");
    assert.match(await page.locator("[data-day-intro-content]").innerText(), /还没有饰品/);
  });
});

test("trinket drawer: third reward can be equipped, then unequipped without leaving the drawer", async () => {
  await withPage(async (page) => {
    await startRun(page);
    await finishRunDay(page, 3);
    await page.getByRole("button", { name: "继续到饰品", exact: true }).click();
    await page.locator('[data-screen-panel="trinket-reward"] [data-trinket-choice]').first().click();
    await page.getByRole("button", { name: "装备", exact: true }).last().click();
    await page.getByRole("button", { name: "进入下一天", exact: true }).click();
    await finishRunDay(page, 4);
    await page.getByRole("button", { name: "继续到饰品", exact: true }).click();
    await page.locator('[data-screen-panel="trinket-reward"] [data-trinket-choice]').first().click();
    await page.getByRole("button", { name: "装备", exact: true }).last().click();
    await page.getByRole("button", { name: "进入下一天", exact: true }).click();
    await finishRunDay(page, 5);
    await page.getByRole("button", { name: "查看今晚结局", exact: true }).click();
    await page.locator('[data-screen-panel="trinket-reward"] [data-trinket-choice]').first().click();
    await page.getByRole("button", { name: "装备", exact: true }).last().click();
    const equipped = await page.locator("[data-trinket-drawer]").innerText();
    assert.equal(await page.locator("[data-equipped-count]").innerText(), "3 / 3");
    await page.locator("[data-trinket-drawer] button").first().click();
    assert.equal(await page.locator("[data-equipped-count]").innerText(), "2 / 3");
    await page.getByRole("button", { name: "装备", exact: true }).last().click();
    assert.equal(await page.locator("[data-equipped-count]").innerText(), "3 / 3");
    assert.equal(await page.locator("[data-trinket-drawer]").innerText(), equipped);
  });
});

test("trinket rules: full slots replace explicitly, cancel is inert, and only equipped pairs synergize", async () => {
  await withPage(async (page) => {
    const html = await readFile(new URL(htmlUrl), "utf8");
    const instrumented = html.replace(
      /      render\(\);\s*\}\)\(\);\s*<\/script>/,
      '      window.__rules = { applyTrinketAction, getSynergies, canEquipTrinket }; render();\n    })();\n  </script>'
    );
    assert.notEqual(instrumented, html);
    await page.setContent(instrumented);
    const result = await page.evaluate(() => {
      const { applyTrinketAction, getSynergies, canEquipTrinket } = window.__rules;
      const full = { inventory: ["old-coin", "warm-bulb", "staff-scarf", "rain-note", "mint-candy", "old-badge", "glowing-key", "thermos"], equippedTrinkets: ["old-coin", "warm-bulb", "rain-note"] };
      const stored = applyTrinketAction(full, { trinketId: "window-seat", action: "store" });
      const needsReplace = canEquipTrinket(full, "window-seat");
      const replaced = applyTrinketAction(full, { trinketId: "window-seat", action: "replace", replaceId: "old-coin" });
      const invalid = applyTrinketAction(full, { trinketId: "window-seat", action: "replace" });
      return { full, stored, needsReplace, replaced, invalid,
        storedPair: getSynergies(["old-coin"]),
        oneItemTags: getSynergies(["thermos", "old-coin"]),
        equippedPair: getSynergies(["warm-bulb", "window-seat"]).map((item) => item.name) };
    });
    assert.match(result.stored.reason, /背包已满/);
    assert.equal(result.needsReplace.ok, false);
    assert.equal(result.invalid.ok, false);
    assert.deepEqual(result.full.equippedTrinkets, ["old-coin", "warm-bulb", "rain-note"]);
    assert.equal(result.replaced.state.inventory.length, 8);
    assert.deepEqual(result.replaced.state.equippedTrinkets, ["window-seat", "warm-bulb", "rain-note"]);
    assert.deepEqual(result.storedPair, []);
    assert.deepEqual(result.oneItemTags, []);
    assert.ok(result.equippedPair.includes("温暖构筑"));
  });
});

test("trinket drawer: replacement can be previewed, canceled, then confirmed", async () => {
  await withPage(async (page) => {
    const html = await readFile(new URL(htmlUrl), "utf8");
    const instrumented = html.replace(
      /      render\(\);\s*\}\)\(\);\s*<\/script>/,
      '      window.__drawerState = { state, trinkets, render }; render();\n    })();\n  </script>'
    );
    assert.notEqual(instrumented, html);
    await page.setContent(instrumented);
    await page.getByRole("button", { name: "开始新一局", exact: true }).click();
    for (const [day, count] of [[1, 3], [2, 4]]) {
      await finishRunDay(page, count);
      await page.getByRole("button", { name: "继续到饰品", exact: true }).click();
      await page.locator('[data-screen-panel="trinket-reward"] [data-trinket-choice]').first().click();
      await page.getByRole("button", { name: "装备", exact: true }).last().click();
      await page.getByRole("button", { name: "进入下一天", exact: true }).click();
    }
    await finishRunDay(page, 5);
    await page.getByRole("button", { name: "查看今晚结局", exact: true }).click();
    const drawer = page.locator('[data-screen-panel="trinket-reward"]');
    await page.evaluate(() => {
      const { state, trinkets, render } = window.__drawerState;
      const extra = trinkets.find((item) => !state.inventory.includes(item.id) && !state.trinketChoices.some((choice) => choice.id === item.id));
      state.inventory.push(extra.id);
      state.equippedTrinkets.push(extra.id);
      render();
    });
    await drawer.locator("[data-trinket-choice]:not([disabled])").first().click();
    await drawer.getByRole("button", { name: "装备", exact: true }).click();
    const before = await drawer.locator("[data-trinket-drawer]").innerText();
    await drawer.locator('[data-action="preview-replace"]').first().click();
    assert.match(await drawer.locator("[data-trinket-action-panel]").innerText(), /卸下.*装备/);
    await drawer.locator('[data-action="confirm-replace"]').press("Escape");
    assert.equal(await drawer.locator("[data-equipped-count]").innerText(), "3 / 3");
    assert.equal(await drawer.locator("[data-trinket-drawer]").innerText(), before);
    await drawer.locator("[data-trinket-choice]:not([disabled])").first().click();
    await drawer.getByRole("button", { name: "装备", exact: true }).click();
    await drawer.locator('[data-action="preview-replace"]').first().click();
    await drawer.getByRole("button", { name: "确认替换", exact: true }).click();
    assert.equal(await drawer.locator("[data-equipped-count]").innerText(), "3 / 3");
    assert.equal(await drawer.locator("[data-inventory-count]").innerText(), "4 / 8");
  });
});

test("trinket rules: synergy feedback requires equipped items and the round trigger", async () => {
  await withPage(async (page) => {
    const html = await readFile(new URL(htmlUrl), "utf8");
    const instrumented = html.replace(
      /      render\(\);\s*\}\)\(\);\s*<\/script>/,
      '      window.__rules = { scoreSelection, customers }; render();\n    })();\n  </script>'
    );
    await page.setContent(instrumented);
    const result = await page.evaluate(() => {
      const { scoreSelection, customers } = window.__rules;
      const customer = customers[0];
      return {
        stored: scoreSelection(customer, ["umbrella", "battery", "magazine"], [], null, 2),
        warmHigh: scoreSelection(customer, ["coffee", "bar", "warmer"], ["warm-bulb", "thermos"], null, 1),
        warmLow: scoreSelection(customer, ["umbrella", "battery", "magazine"], ["warm-bulb", "thermos"], null, 1),
        clarityMiss: scoreSelection(customer, ["bar", "battery", "magazine"], ["rain-note", "old-badge"], null, 2)
      };
    });
    assert.deepEqual(result.stored.triggeredSynergies, []);
    assert.equal(result.warmHigh.triggeredSynergies.includes("温暖构筑"), false);
    assert.equal(result.warmLow.triggeredSynergies.includes("温暖构筑"), true);
    assert.equal(result.warmLow.score, 2);
    assert.equal(result.clarityMiss.triggeredSynergies.includes("倾听构筑"), false);
  });
});

for (const width of [320, 390, 1280]) {
  test(`new surfaces ${width}px: dialogue and drawer fit without horizontal overflow`, async () => {
    await withPage(async (page) => {
      await startRun(page);
      await page.getByRole("button", { name: "开始营业", exact: true }).click();
      const dialogue = page.locator("[data-night-dialogue]");
      assert.equal(await dialogue.isVisible(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(evidenceDir, `dialogue-${width}.png`) });
      for (let index = 0; index < 3; index += 1) {
        const ids = await page.locator("[data-product-card]:not([disabled])").evaluateAll((cards) => cards.slice(0, 3).map((card) => card.dataset.productId));
        for (const id of ids) await page.locator(`[data-product-id="${id}"]`).click();
        await page.getByRole("button", { name: "装袋", exact: true }).click();
        await page.getByRole("button", { name: "继续", exact: true }).click();
      }
      await page.getByRole("button", { name: "继续到饰品", exact: true }).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.locator('[data-screen-panel="trinket-reward"] [data-trinket-choice]').first().click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(evidenceDir, `drawer-${width}.png`) });
    }, { viewport: { width, height: width < 600 ? 844 : 1000 }, reducedMotion: "reduce" });
  });
}

test("selection: three-item limit, deselection and submission guard", async () => {
  await withPage(async (page) => {
    await start(page);
    const submit = page.getByRole("button", { name: "装袋", exact: true });
    assert.equal(await submit.isEnabled(), false);
    for (const id of ["coffee", "milk", "bar"]) {
      await page.locator(`[data-product-id="${id}"]`).click();
    }
    assert.equal(await page.locator("[data-bag-count]").innerText(), "3 / 3");
    assert.equal(await page.locator('[data-product-id="warmer"]').isEnabled(), false);
    assert.equal(await submit.isEnabled(), true);
    await page.locator('[data-product-id="milk"]').click();
    assert.equal(await page.locator("[data-bag-count]").innerText(), "2 / 3");
    assert.equal(await submit.isEnabled(), false);
    assert.equal(await page.locator('[data-product-id="warmer"]').isEnabled(), true);
    await page.locator('[data-product-id="warmer"]').click();
    await submit.click();
    assert.equal(await page.locator("[data-product-card]:enabled").count(), 0);
    assert.match(await page.locator("[data-receipt]").innerText(), /阿成.*热咖啡.*能量棒.*暖手贴/s);
    await page.screenshot({ path: path.join(evidenceDir, "feedback-desktop.png") });
    await page.getByRole("button", { name: "继续", exact: true }).click();
    assert.equal(await page.locator("[data-customer-progress]").innerText(), "02 / 03");
    assert.equal(await page.locator("[data-bag-count]").innerText(), "0 / 3");
  });
});

const endingRoutes = [
  {
    name: "bright",
    title: "今晚的灯一直亮着",
    bags: [
      ["coffee", "bar", "warmer"],
      ["battery", "magazine", "milk"],
      ["milk", "umbrella", "magazine"]
    ]
  },
  {
    name: "rain",
    title: "雨停了，但店里还有人",
    bags: Array.from({ length: 3 }, () => ["coffee", "milk", "bar"])
  },
  {
    name: "stay",
    title: "打烊之前，请再坐一会儿",
    bags: [
      ["umbrella", "battery", "magazine"],
      ["coffee", "gum", "bar"],
      ["coffee", "gum", "bar"]
    ]
  }
];

for (const route of endingRoutes) {
  test(`ending ${route.name}: reachable by ordinary clicks and clean replay`, async () => {
    await withPage(async (page) => {
      await start(page);
      for (const bag of route.bags) await serve(page, bag);
      assert.equal(await page.locator("#ending-title").innerText(), route.title);
      assert.equal(await page.locator(".ending-receipt .receipt-line").count(), 3);
      await page.screenshot({ path: path.join(evidenceDir, `ending-${route.name}.png`) });
      await page.getByRole("button", { name: "再来一晚", exact: true }).click();
      assert.equal(await page.locator('[data-screen-panel="intro"]').isVisible(), true);
      await page.getByRole("button", { name: "开始值班", exact: true }).click();
      assert.equal(await page.locator("[data-bag-count]").innerText(), "0 / 3");
      assert.equal(await page.locator("[data-customer-progress]").innerText(), "01 / 03");
      assert.doesNotMatch(await page.locator("[data-receipt]").innerText(), /刚刚好/);
    });
  });
}

test("feedback: never mentions an item that was not packed", async () => {
  await withPage(async (page) => {
    await start(page);
    for (const id of ["coffee", "milk", "bar"]) {
      await page.locator(`[data-product-id="${id}"]`).click();
    }
    await page.getByRole("button", { name: "装袋", exact: true }).click();
    assert.doesNotMatch(await page.locator("[data-feedback]").innerText(), /暖手贴/);
  });
});

test("keyboard: selection preserves focus and feedback advances focus", async () => {
  await withPage(async (page) => {
    await start(page);
    const coffee = page.locator('[data-product-id="coffee"]');
    await coffee.focus();
    await coffee.press("Enter");
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.productId), "coffee");
    await page.locator('[data-product-id="milk"]').click();
    await page.locator('[data-product-id="bar"]').click();
    await page.getByRole("button", { name: "装袋", exact: true }).click();
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.action), "continue");
  });
});

test("audio: user-controlled on/off without blocking progress", async () => {
  await withPage(async (page) => {
    await start(page);
    const audio = page.locator('[data-action="toggle-audio"]');
    await audio.click();
    assert.equal(await audio.getAttribute("aria-pressed"), "true");
    await audio.click();
    assert.equal(await audio.getAttribute("aria-pressed"), "false");
    await serve(page, ["coffee", "milk", "bar"]);
    assert.equal(await page.locator("[data-customer-progress]").innerText(), "02 / 03");
  });
});

test("audio: unavailable browser API is a non-blocking state", async () => {
  await withPage(async (page) => {
    await page.addInitScript(() => {
      window.AudioContext = undefined;
      window.webkitAudioContext = undefined;
    });
    await start(page);
    await page.locator('[data-action="toggle-audio"]').click();
    assert.equal(await page.locator('[data-action="toggle-audio"]').getAttribute("aria-pressed"), "false");
    assert.match(await page.locator('[data-action="toggle-audio"]').getAttribute("aria-label") || "", /不可用/);
    await serve(page, ["coffee", "milk", "bar"]);
  });
});

test("scene: each customer has distinct artwork and an observable clue", async () => {
  await withPage(async (page) => {
    await start(page);
    for (const [index, customer] of ["cheng", "xiaoyu", "unnamed"].entries()) {
      assert.equal(await page.locator("[data-scene-customer]").getAttribute("data-scene-customer"), customer);
      assert.equal(await page.locator("[data-store-stage] .scene-art").isVisible(), true);
      assert.equal(await page.locator("[data-observation]").isVisible(), true);
      await page.screenshot({ path: path.join(evidenceDir, `customer-${index + 1}.png`) });
      await serve(page, endingRoutes[0].bags[index]);
    }
  });
});

test("scene: shelf illustrations have explicit bounded dimensions", async () => {
  await withPage(async (page) => {
    await start(page);
    const sizes = await page.locator("[data-store-stage] .scene-art svg").evaluateAll((icons) =>
      icons.map((icon) => ({ width: icon.getAttribute("width"), height: icon.getAttribute("height") }))
    );
    assert.equal(sizes.length, 8);
    assert.equal(sizes.every((size) => size.width === "48" && size.height === "64"), true);
  });
});

test("scene: student's face is rendered above the hair layer", async () => {
  await withPage(async (page) => {
    await start(page);
    await serve(page, ["coffee", "bar", "warmer"]);
    assert.equal(await page.locator('[data-scene-customer="xiaoyu"] [data-face]').count(), 1);
    const faceAfterHair = await page.locator('[data-scene-customer="xiaoyu"]').evaluate((person) =>
      person.querySelector("[data-face]") === person.querySelector(".scene-person-art").lastElementChild
    );
    assert.equal(faceAfterHair, true);
  });
});

test("scene: packed bag changes the light and gives the customer a shopping bag", async () => {
  await withPage(async (page) => {
    await start(page);
    const light = page.locator("[data-store-stage] [data-scene-light]");
    assert.equal(await light.count(), 1);
    const initialColor = await light.getAttribute("fill");
    for (const id of ["coffee", "bar", "warmer"]) {
      await page.locator(`[data-product-id="${id}"]`).click();
    }
    await page.getByRole("button", { name: "装袋", exact: true }).click();
    assert.notEqual(await light.getAttribute("fill"), initialColor);
    assert.equal(await page.locator("[data-scene-bag]").count(), 1);
    await page.getByRole("button", { name: "继续", exact: true }).click();
    assert.equal(await light.getAttribute("fill"), initialColor);
    assert.equal(await page.locator("[data-scene-bag]").count(), 0);
  });
});

test("audio: rejected resume does not cause an unhandled rejection", async () => {
  await withPage(async (page) => {
    await page.addInitScript(() => {
      if (window.AudioContext) {
        window.AudioContext.prototype.resume = async () => {
          throw new Error("Audio device unavailable");
        };
      }
    });
    await start(page);
    await page.locator('[data-action="toggle-audio"]').click();
    await page.waitForTimeout(50);
    assert.equal(await page.locator('[data-action="toggle-audio"]').getAttribute("aria-pressed"), "false");
    await serve(page, ["coffee", "milk", "bar"]);
  });
});

test("audio: mute control remains reachable on intro and ending screens", async () => {
  await withPage(async (page) => {
    await page.goto(htmlUrl);
    assert.equal(await page.locator('[data-action="toggle-audio"]').isVisible(), true);
    await page.getByRole("button", { name: "开始值班", exact: true }).click();
    await page.locator('[data-action="toggle-audio"]').click();
    for (const bag of endingRoutes[0].bags) await serve(page, bag);
    assert.equal(await page.locator('[data-action="toggle-audio"]').isVisible(), true);
    await page.locator('[data-action="toggle-audio"]').click();
    assert.equal(await page.locator('[data-action="toggle-audio"]').getAttribute("aria-pressed"), "false");
  });
});

for (const width of [320, 390, 768, 1280, 1440]) {
  test(`responsive ${width}px: no horizontal overflow or clipped controls`, async () => {
    await withPage(async (page) => {
      await page.goto(htmlUrl);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await start(page);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const clipped = await page.locator("[data-product-card]").evaluateAll((cards) =>
        cards.filter((card) => {
          const box = card.getBoundingClientRect();
          return box.left < 0 || box.right > innerWidth + 1 || box.width < 44 || box.height < 44;
        }).length
      );
      assert.equal(clipped, 0);
      const productOverlap = await page.locator("[data-product-card]").evaluateAll((cards) =>
        cards.some((card) => {
          const icon = card.querySelector(".product-icon").getBoundingClientRect();
          const name = card.querySelector(".product-name").getBoundingClientRect();
          if (innerWidth > 560) return false;
          return icon.bottom > name.top + 1;
        })
      );
      assert.equal(productOverlap, false, "Illustrations do not overlap product names");
      const viewportLabel = width === 390 ? "mobile" : `desktop-${width}`;
      if ([390, 1280, 1440].includes(width)) {
        await page.screenshot({ path: path.join(evidenceDir, `game-${viewportLabel}.png`), fullPage: true });
      }
      for (const bag of endingRoutes[0].bags) await serve(page, bag);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (width === 390) {
        await page.screenshot({ path: path.join(evidenceDir, "ending-mobile.png"), fullPage: true });
      }
    }, { viewport: { width, height: width < 600 ? 844 : 1000 }, reducedMotion: "reduce" });
  });
}

test("mobile flow: submitting brings the feedback button into view", async () => {
  await withPage(async (page) => {
    await start(page);
    for (const id of ["coffee", "milk", "bar"]) {
      await page.locator(`[data-product-id="${id}"]`).click();
    }
    await page.getByRole("button", { name: "装袋", exact: true }).click();
    const continueButton = page.getByRole("button", { name: "继续", exact: true });
    const box = await continueButton.boundingBox();
    assert.equal(box.y >= 0 && box.y + box.height <= 844, true);
    await continueButton.click();
    assert.equal(await page.locator("#customer-name").innerText(), "小雨");
    const nameBox = await page.locator("#customer-name").boundingBox();
    assert.equal(nameBox.y >= 0 && nameBox.y < 844, true);
  }, { viewport: { width: 390, height: 844 } });
});
