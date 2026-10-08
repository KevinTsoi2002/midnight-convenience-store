# 《凌晨 2:17 的便利店》Roguelite 扩展实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有三位顾客的单晚叙事游戏扩展为三天一局、随机顾客、每日事件、饰品构筑和现实时间展示的轻 Roguelite，同时保持单 HTML、离线可玩和现有视觉语言。

**Architecture:** 继续维护 `midnight-convenience-store.html` 这一交付文件，在现有 IIFE 内按“数据与纯规则 -> 状态生命周期 -> 渲染 -> 事件绑定”顺序扩展。随机业务逻辑使用可注入的种子，浏览器测试通过 `?seed=` 固定结果；动画和 Web Audio 仍然只负责表现，不参与结算。回归测试继续使用 Node test runner + Playwright + Microsoft Edge。

**Tech Stack:** HTML5、CSS、原生 JavaScript、SVG、Web Audio API、Node.js test runner、Playwright 1.64.0。

---

## 文件结构与边界

- **Modify:** `midnight-convenience-store.html`
  - 增加三日运行状态、现实/叙事时间、顾客池、事件池、饰品池、种子随机、结算和奖励界面。
  - 保持所有运行时 CSS、HTML、JavaScript、SVG 内嵌，不加载外部资源。
  - 新增 DOM 标记：`data-run-day`、`data-night-event`、`data-settlement`、`data-trinket-choice`、`data-trinket-slot`、`data-inventory-count`。
- **Modify:** `tests/midnight-convenience-store.spec.mjs`
  - 保留单文件、离线、音频、键盘、场景和响应式测试。
  - 将固定三位顾客测试改成固定种子下的三日流程测试。
  - 增加随机稳定性、每日结算、饰品容量、事件禁售、现实时间和五类结局测试。
- **Modify:** `README.md`
  - 更新试玩说明、三天玩法、饰品规则和测试命令。
- **Modify:** `docs/superpowers/specs/2026-10-09-midnight-convenience-store-roguelite-design.md`
  - 仅在实现过程中发现必要的规则澄清时追加决策记录，不重写已确认的设计方向。

## 统一实现约定

业务随机全部走这组接口，禁止在评分、顾客排序或饰品品质计算中直接调用 `Math.random()`：

```js
function createSeededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function getSeedFromUrl() {
  const raw = new URLSearchParams(location.search).get("seed");
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) ? parsed >>> 0 : (Date.now() >>> 0);
}
```

测试固定使用 `?seed=20261009`。页面显示的 `data-run-seed` 只用于测试与可复现记录，不向普通玩家解释随机算法。

---

### Task 1: 建立种子随机、时间和三日状态模型

**Files:**
- Modify: `midnight-convenience-store.html`
- Test: `tests/midnight-convenience-store.spec.mjs`

- [ ] **Step 1: 写失败测试，固定种子并验证现实时间与初始运行状态**

在测试文件加入：

```js
test("run setup: fixed seed exposes day one and the user's local clock", async () => {
  await withPage(async (page) => {
    await page.goto(`${htmlUrl}?seed=20261009`);
    const expectedClock = await page.evaluate(() => new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit", minute: "2-digit", hour12: false
    }).format(new Date()));
    assert.equal(await page.locator("[data-real-clock]").innerText(), expectedClock);
    assert.equal(await page.locator("[data-run-day]").innerText(), "第 1 天");
    assert.equal(await page.locator("[data-night-clock]").innerText(), "02:17");
    assert.equal(await page.locator('[data-action="start"]').isVisible(), true);
  });
});
```

- [ ] **Step 2: 运行该测试确认它失败**

运行 `npm test`。预期新测试因 `[data-real-clock]` 和 `[data-run-day]` 不存在而失败，旧测试仍可通过。

- [ ] **Step 3: 实现时间工具和状态初始化**

在现有 `state` 替换为：

```js
const state = {
  screen: "intro",
  day: 1,
  maxDays: 3,
  customerIndex: 0,
  dailyCustomers: [],
  currentEvent: null,
  selectedProductIds: [],
  roundScores: [],
  dailyScores: [],
  receipt: [],
  hiddenNeedHits: 0,
  dailyHiddenNeedHits: 0,
  streak: 0,
  dailyBestStreak: 0,
  inventory: [],
  equippedTrinkets: [],
  trinketChoices: [],
  runSeed: getSeedFromUrl(),
  realStartTime: null,
  realClock: getRealClock(),
  gameClock: "02:17",
  audioEnabled: false,
  audioUnavailable: false,
  showFeedback: false,
  showSettlement: false,
  showTrinketReward: false,
  screenBeforeOverlay: "game"
};

function getRealClock(date = new Date()) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit", minute: "2-digit", hour12: false
  }).format(date);
}

function getNightClock(day) {
  return ["02:17", "03:06", "04:12"][day - 1] ?? "04:12";
}

function getTimeMood(hour) {
  if (hour < 6) return "这个时间，只有还没睡的人知道。";
  if (hour < 12) return "城市醒了，昨晚的事还没有完全结束。";
  if (hour < 18) return "白天也有人把心事带进便利店。";
  return "夜班还没有开始，但灯已经提前亮了。";
}
```

在顶部栏和 intro 中加入 `data-real-clock`、`data-run-day`、`data-night-clock`、`data-time-mood`，并在 `render()` 中同步 `state.realClock` 与 `state.gameClock`。

- [ ] **Step 4: 运行测试确认通过且旧状态可清空**

运行 `npm test`，预期至少 23 项通过。新增 `resetGame()` 必须重置 `day`、`dailyCustomers`、`inventory`、`equippedTrinkets`、`receipt` 和种子内的运行进度，但保留 URL 种子。

- [ ] **Step 5: 提交阶段性变更**

```powershell
git add midnight-convenience-store.html tests/midnight-convenience-store.spec.mjs
git commit -m "feat: add seeded run state and night clock"
```

---

### Task 2: 建立顾客池、难度曲线和每日事件

**Files:**
- Modify: `midnight-convenience-store.html`
- Test: `tests/midnight-convenience-store.spec.mjs`

- [ ] **Step 1: 写失败测试，验证随机稳定性、数量递增和事件可见**

```js
test("daily run: same seed gives the same customers and each day gets harder", async () => {
  const readRun = async () => {
    const page = await browser.newPage();
    await page.goto(`${htmlUrl}?seed=20261009`);
    await page.getByRole("button", { name: "开始新一局", exact: true }).click();
    const first = await page.locator("[data-daily-customer]").evaluateAll((nodes) => nodes.map((n) => n.dataset.customerId));
    const counts = [first.length];
    const events = [await page.locator("[data-night-event]").innerText()];
    await page.getByRole("button", { name: "开始营业", exact: true }).click();
    for (let day = 1; day <= 3; day += 1) {
      for (let index = 0; index < Number(await page.locator("[data-customer-count]").getAttribute("data-customer-count")); index += 1) {
        await page.locator("[data-product-card]:not([disabled])").evaluateAll((cards) => cards.slice(0, 3).forEach((card) => card.click()));
        await page.getByRole("button", { name: "装袋", exact: true }).click();
        await page.getByRole("button", { name: "继续", exact: true }).click();
      }
      if (day < 3) {
        await page.getByRole("button", { name: "继续到饰品", exact: true }).click();
        await page.locator("[data-trinket-choice]").first().click();
        await page.getByRole("button", { name: "开始营业", exact: true }).click();
        counts.push(await page.locator("[data-daily-customer]").count());
        events.push(await page.locator("[data-night-event]").innerText());
      }
    }
    await page.close();
    return { first, counts, events };
  };
  const firstRun = await readRun();
  const secondRun = await readRun();
  assert.deepEqual(firstRun, secondRun);
  assert.deepEqual(firstRun.counts, [3, 4, 5]);
});
```

测试辅助应在本任务中改成点击真实 UI，不依赖内部闭包变量；若事件文本随机命中相同内容，不把“不同事件”作为断言，只断言事件存在且种子复现。

- [ ] **Step 2: 运行新测试确认失败**

运行 `npm test`。预期失败点是缺少“开始新一局”、每日顾客清单和每日事件。

- [ ] **Step 3: 替换顾客数据并实现种子抽取**

保留阿成、小雨、没有名字的人作为前三个顾客，新增林姐、老陈、戴耳机的人、维修工、快递站老板和小男孩与爸爸。每个模型必须包含 `hiddenNeeds`、`avoidTags`、`basePatience`、`weight`、`dayRange` 和三档 `response`。

实现以下函数：

```js
function buildDailyCustomers(day, seed, previousIds = []) {
  const random = createSeededRandom(seed + day * 7919);
  const count = [3, 4, 5][day - 1];
  const eligible = customers.filter((customer) => customer.dayRange[0] <= day && day <= customer.dayRange[1]);
  const pool = eligible.map((customer) => ({
    customer,
    weight: previousIds.includes(customer.id) ? customer.weight * 0.45 : customer.weight
  }));
  const chosen = [];
  while (chosen.length < count && pool.length) {
    const total = pool.reduce((sum, item) => sum + item.weight, 0);
    let cursor = random() * total;
    const index = pool.findIndex((item) => (cursor -= item.weight) <= 0);
    chosen.push(pool.splice(index < 0 ? pool.length - 1 : index, 1)[0].customer);
  }
  return chosen;
}

function getDifficulty(day) {
  return {
    customerCount: [3, 4, 5][day - 1],
    hiddenNeeds: day >= 2,
    reducedClues: day >= 3,
    eventIntensity: day,
    patiencePenalty: day === 1 ? 0 : day - 1
  };
}
```

实现六个事件对象，每个对象提供 `id`、`name`、`description`、`blockedProductIds`、`tagWeights`、`hiddenNeedSubstitute` 和 `applyRoundModifiers()`。冰柜断电必须只禁用 `milk` 与 `hot-food`，并通过 `[data-product-card]` 的 `disabled` 状态保留至少七件可选商品。

- [ ] **Step 4: 接入每日开场卡和顾客清单**

开始新局时生成第 1 天 `dailyCustomers` 和 `currentEvent`；每天进入营业前重新生成。开场卡显示第几天、游戏时间、现实时间、事件名称、事件说明和当前装备饰品。游戏面板的进度改为 `${customerIndex + 1} / ${dailyCustomers.length}`。

- [ ] **Step 5: 运行测试并提交**

运行 `npm test`，预期新增每日测试和现有单晚回归测试通过。提交：

```powershell
git add midnight-convenience-store.html tests/midnight-convenience-store.spec.mjs
git commit -m "feat: add seeded customers difficulty and night events"
```

---

### Task 3: 扩展评分、隐藏需求和事件修正

**Files:**
- Modify: `midnight-convenience-store.html`
- Test: `tests/midnight-convenience-store.spec.mjs`

- [ ] **Step 1: 写失败测试，验证隐藏需求与禁售商品**

```js
test("round scoring: day two exposes hidden clues and blocked products cannot be selected", async () => {
  await withPage(async (page) => {
    await page.goto(`${htmlUrl}?seed=20261009`);
    await page.getByRole("button", { name: "开始新一局", exact: true }).click();
    await page.getByRole("button", { name: "开始营业", exact: true }).click();
    await finishCurrentDay(page, 3);
    await page.getByRole("button", { name: "继续到饰品", exact: true }).click();
    await page.locator("[data-trinket-choice]").first().click();
    await page.getByRole("button", { name: "开始营业", exact: true }).click();
    assert.equal(await page.locator("[data-hidden-clue]").count() > 0, true);
    const blocked = page.locator('[data-product-id="milk"]:disabled, [data-product-id="hot-food"]:disabled');
    assert.equal(await blocked.count() >= 1, true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

预期当前评分只看显性 `needs`，没有 `hiddenNeedHits`、事件标签权重或禁售状态。

- [ ] **Step 3: 实现统一评分接口**

将旧 `scoreSelection(customer, selectedIds)` 替换为：

```js
function scoreSelection(customer, selectedIds, trinkets = [], event = null, day = 1) {
  const selectedTags = new Set(products
    .filter((product) => selectedIds.includes(product.id))
    .flatMap((product) => product.tags));
  const tagWeights = event?.tagWeights ?? {};
  const visibleScore = customer.needs.reduce((score, need) => score + (selectedTags.has(need) ? (tagWeights[need] ?? 1) : 0), 0);
  const hiddenScore = day >= 2 ? customer.hiddenNeeds.reduce((score, need) => score + (selectedTags.has(need) ? 1 : 0), 0) : 0;
  const hiddenNeedHit = hiddenScore > 0 || Boolean(event?.hiddenNeedSubstitute && selectedTags.has(event.hiddenNeedSubstitute));
  const modifiers = getTrinketModifiers(trinkets, { customer, selectedTags, day });
  const rawScore = visibleScore + hiddenScore + modifiers.scoreBonus;
  return {
    score: Math.min(3, Math.max(0, rawScore)),
    visibleScore,
    hiddenNeedHit,
    responseLevel: responseLevel(Math.min(3, Math.max(0, rawScore)))
  };
}
```

`getTrinketModifiers()` 只返回规则结果，不修改 DOM；低分容错、线索显示和一次性效果通过 `state.roundFlags` 消费，避免同一饰品在一轮重复触发。

- [ ] **Step 4: 更新提交流程**

提交时记录完整 round entry：

```js
{
  day,
  customerId,
  customerName,
  productIds,
  score,
  hiddenNeedHit,
  eventId,
  gameClock
}
```

更新 `dailyScores`、`dailyHiddenNeedHits`、`streak`、`dailyBestStreak`，并在新一轮清空 `selectedProductIds` 与一次性 `roundFlags`。

- [ ] **Step 5: 运行全套测试并提交**

运行 `npm test`，确认现有商品选择上限、反馈、音频和键盘测试仍通过。提交：

```powershell
git add midnight-convenience-store.html tests/midnight-convenience-store.spec.mjs
git commit -m "feat: score hidden needs and event modifiers"
```

---

### Task 4: 实现每日结算和饰品数据/品质/容量规则

**Files:**
- Modify: `midnight-convenience-store.html`
- Test: `tests/midnight-convenience-store.spec.mjs`

- [ ] **Step 1: 写失败测试，验证结算分、品质和容量上限**

```js
test("settlement: daily performance unlocks three trinket choices and enforces capacity", async () => {
  await withPage(async (page) => {
    await page.goto(`${htmlUrl}?seed=20261009`);
    await page.getByRole("button", { name: "开始新一局", exact: true }).click();
    await page.getByRole("button", { name: "开始营业", exact: true }).click();
    await finishCurrentDay(page, 3);
    await assertVisible(page, '[data-settlement]');
    assert.equal(await page.locator("[data-help-rate]").isVisible(), true);
    assert.equal(await page.locator("[data-trinket-choice]").count(), 3);
    assert.match(await page.locator("[data-quality-range]").innerText(), /普通|稀有|史诗|传说/);
    await page.locator("[data-trinket-choice]").first().click();
    assert.equal(await page.locator("[data-inventory-count]").innerText(), "1 / 8");
    assert.equal(await page.locator("[data-equipped-count]").innerText(), "1 / 3");
  });
});
```

在测试辅助区加入 `finishCurrentDay(page, expectedCount)`，每轮点击前三个未禁用商品、提交、点击继续，并断言最后一轮后进入 `[data-settlement]`。

辅助函数的具体实现：

```js
async function finishCurrentDay(page, expectedCount) {
  assert.equal(await page.locator("[data-daily-customer]").count(), expectedCount);
  for (let index = 0; index < expectedCount; index += 1) {
    const ids = await page
      .locator("[data-product-card]:not([disabled])")
      .evaluateAll((cards) => cards.slice(0, 3).map((card) => card.dataset.productId));
    for (const id of ids) await page.locator(`[data-product-id="${id}"]`).click();
    await page.getByRole("button", { name: "装袋", exact: true }).click();
    await page.getByRole("button", { name: "继续", exact: true }).click();
  }
  assert.equal(await page.locator("[data-settlement]").isVisible(), true);
}

async function assertVisible(page, selector) {
  assert.equal(await page.locator(selector).isVisible(), true);
}
```

- [ ] **Step 2: 运行测试确认失败**

预期缺少结算层、饰品候选、品质区间和容量计数。

- [ ] **Step 3: 增加 12～16 件饰品数据**

每件饰品固定字段：

```js
{
  id,
  name,
  rarity,
  tags,
  description,
  archetype,
  effect,
  unique: true
}
```

至少实现规格中列出的旧硬币、暖黄灯泡、店员围巾、雨夜便签、不合时宜的薄荷糖、旧店员名牌、会发光的钥匙，再补足 `company`、`light`、`practical`、`clarity`、`patience`、`risk` 方向到 12 件。`unique` 饰品不得重复进入背包或候选。

- [ ] **Step 4: 实现结算与品质函数**

```js
function getDailySettlement(day, scores, entries, event) {
  const average = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
  const helpRate = Math.round((scores.filter((score) => score >= 2).length / Math.max(1, scores.length)) * 100);
  const hiddenNeedHits = entries.filter((entry) => entry.hiddenNeedHit).length;
  const bestStreak = entries.reduce((best, entry, index) => {
    const current = entries.slice(0, index + 1).slice(-3).filter((item) => item.score >= 2).length;
    return Math.max(best, current);
  }, 0);
  const qualityScore = Math.round(day + average + hiddenNeedHits + bestStreak + (event?.bonus ?? 0));
  return { average, helpRate, hiddenNeedHits, bestStreak, qualityScore };
}

function getTrinketQuality(settlement, day) {
  if (day === 3 && settlement.qualityScore >= 8) return ["rare", "epic", "legendary"];
  if (settlement.qualityScore >= 8) return ["rare", "epic"];
  if (settlement.qualityScore >= 6) return ["rare"];
  if (settlement.qualityScore >= 3) return ["common", "rare"];
  return ["common"];
}
```

候选生成使用当前种子继续抽取：一张“贴合表现”、一张“补足弱点”、一张“风险收益”，最终去重并保持三张。

- [ ] **Step 5: 实现背包和装备选择规则**

`applyTrinket(id, mode)` 必须遵守：背包总数不超过 8，装备总数不超过 3，同一饰品只能装备或存放一次；装备满时显示替换选项和放弃选项，不用 `confirm()` 阻塞浏览器。

- [ ] **Step 6: 运行全套测试并提交**

运行 `npm test`，确认结算、品质、容量和旧测试全部通过。提交：

```powershell
git add midnight-convenience-store.html tests/midnight-convenience-store.spec.mjs
git commit -m "feat: add daily settlement and trinket rewards"
```

---

### Task 5: 接入三日流程、开场卡和饰品选择界面

**Files:**
- Modify: `midnight-convenience-store.html`
- Test: `tests/midnight-convenience-store.spec.mjs`

- [ ] **Step 1: 写失败测试，验证三日推进和重玩清空**

```js
test("three-day run: settlement leads to the next day and replay clears trinkets", async () => {
  await withPage(async (page) => {
    await page.goto(`${htmlUrl}?seed=20261009`);
    await page.getByRole("button", { name: "开始新一局", exact: true }).click();
    for (const [day, count] of [[1, 3], [2, 4], [3, 5]]) {
      assert.equal(await page.locator("[data-run-day]").innerText(), `第 ${day} 天`);
      await page.getByRole("button", { name: "开始营业", exact: true }).click();
      await finishCurrentDay(page, count);
      if (day < 3) {
        await page.getByRole("button", { name: "继续到饰品", exact: true }).click();
        await page.locator("[data-trinket-choice]").first().click();
      }
    }
    assert.equal(await page.locator('[data-screen-panel="ending"]').isVisible(), true);
    await page.getByRole("button", { name: "再来一局", exact: true }).click();
    assert.equal(await page.locator("[data-inventory-count]").innerText(), "0 / 8");
    assert.equal(await page.locator("[data-run-day]").innerText(), "第 1 天");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

预期当前 `继续` 仍直接切换固定三位顾客，缺少结算和饰品覆盖层。

- [ ] **Step 3: 扩展 HTML 面板**

在现有 `game-screen` 后新增：

```html
<section class="run-overlay" data-screen-panel="settlement" hidden aria-labelledby="settlement-title">
  <div data-settlement></div>
</section>
<section class="run-overlay" data-screen-panel="trinket-reward" hidden aria-labelledby="trinket-title">
  <div data-trinket-reward></div>
</section>
```

结算面板必须有 `[data-help-rate]`、`[data-hidden-hit-count]`、`[data-quality-range]` 和 `data-action="continue-to-trinkets"`。饰品面板每张卡必须有 `[data-trinket-choice]`、品质文字、效果说明和 `[data-action="choose-trinket"]`。

- [ ] **Step 4: 实现明确的状态流转**

使用以下 transitions：

```text
intro -> day-intro -> game -> feedback -> game
game(last customer) -> settlement -> trinket-reward -> day-intro
game(day 3 last customer) -> settlement -> ending
ending -> intro
```

提交最后一位顾客后不再直接调用 `ending`。`continue` 先推进当前日的结算；结算按钮进入饰品候选；选择饰品后若未到第三天进入下一天开场卡，否则进入结局。第三天的结算仍显示，但按钮改为“查看今晚结局”。

- [ ] **Step 5: 实现渲染和焦点管理**

`render()` 只显示一个主屏和一个覆盖层；每次覆盖层打开后聚焦第一张饰品卡或主要按钮。关闭覆盖层后聚焦下一天标题。移动端面板使用单列 CSS，饰品卡最小高度 160px，按钮最小触控尺寸 44px。

- [ ] **Step 6: 运行全套测试并提交**

运行 `npm test`，确认三日流程、重玩、键盘焦点和移动端不溢出。提交：

```powershell
git add midnight-convenience-store.html tests/midnight-convenience-store.spec.mjs
git commit -m "feat: connect three-day run flow and reward screens"
```

---

### Task 6: 更新结局、套装协同和最终结算文案

**Files:**
- Modify: `midnight-convenience-store.html`
- Test: `tests/midnight-convenience-store.spec.mjs`

- [ ] **Step 1: 写失败测试，验证至少三种 Roguelite 结局可达**

使用三个固定种子路线，分别断言高分隐藏命中、低分波动和饰品协同结局。测试不依赖随机碰运气，必须通过 `?seed=` 和选择商品完成。

```js
test("ending routes: seeded runs reach ordinary, trinket synergy, and unstable outcomes", async () => {
  const routes = [
    { seed: 101, title: "今晚的灯一直亮着" },
    { seed: 202, title: "这盏灯不是一个人点亮的" },
    { seed: 303, title: "明天还会有人来" }
  ];
  for (const route of routes) {
    await withPage(async (page) => {
      await page.goto(`${htmlUrl}?seed=${route.seed}`);
      await completeRunWithFirstThreeChoices(page);
      assert.equal(await page.locator("#ending-title").innerText(), route.title);
    });
  }
});

async function completeRunWithFirstThreeChoices(page) {
  await page.getByRole("button", { name: "开始新一局", exact: true }).click();
  for (const count of [3, 4, 5]) {
    await page.getByRole("button", { name: "开始营业", exact: true }).click();
    await finishCurrentDay(page, count);
    if (count < 5) {
      await page.getByRole("button", { name: "继续到饰品", exact: true }).click();
      await page.locator("[data-trinket-choice]").first().click();
    } else {
      await page.getByRole("button", { name: "查看今晚结局", exact: true }).click();
    }
  }
}
```

若固定路线无法达到目标，先调整顾客候选和候选饰品池的种子映射，再改文案阈值；不要在测试中直接写入隐藏状态。

- [ ] **Step 2: 实现套装协同与结局规则**

实现三组明确协同：`warmth + comfort`、`clarity + company`、`risk + energy`。`getRunEnding(state)` 按以下优先级返回：

```js
if (highHelp && hasHiddenNeedHit && hasSynergy) return "shared-light";
if (highHelp && hasHiddenNeedHit) return "bright";
if (volatileRun) return "tomorrow";
if (mediumHelp) return "rain";
return "stay";
```

新增结局文案必须继续显示三天小票、装备饰品摘要和当前现实时间，不删除现有三个结局标题。

- [ ] **Step 3: 运行结局路线测试并提交**

运行 `npm test`，确保五种结局中至少三种有稳定路径，并提交：

```powershell
git add midnight-convenience-store.html tests/midnight-convenience-store.spec.mjs
git commit -m "feat: add trinket synergies and roguelite endings"
```

---

### Task 7: 完成响应式视觉、离线验证和文档

**Files:**
- Modify: `midnight-convenience-store.html`
- Modify: `tests/midnight-convenience-store.spec.mjs`
- Modify: `README.md`

- [ ] **Step 1: 增加 UI 验收测试**

加入以下断言：

```js
test("new screens: settlement and trinket cards fit mobile viewports", async () => {
  await withPage(async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${htmlUrl}?seed=20261009`);
    await page.getByRole("button", { name: "开始新一局", exact: true }).click();
    await page.getByRole("button", { name: "开始营业", exact: true }).click();
    await finishCurrentDay(page, 3);
    for (const selector of ["[data-settlement]", "[data-trinket-reward]"]) {
      const panel = page.locator(selector);
      if (await panel.isVisible()) {
        const box = await panel.boundingBox();
        assert.equal(box.left >= 0 && box.right <= 390, true);
      }
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  });
});
```

- [ ] **Step 2: 调整样式并完成无障碍状态**

为开场卡、结算卡和饰品卡增加稳定尺寸、焦点样式、品质色彩与文字标签。品质不能只靠颜色表达，必须同时显示“普通 / 稀有 / 史诗 / 传说”。覆盖层必须支持 `hidden`、`aria-live="polite"` 和 Escape 关闭当前替换确认。

- [ ] **Step 3: 更新 README**

加入三天玩法、饰品背包/装备槽、现实时间和固定种子测试说明；保留在线试玩链接和单 HTML 离线说明，不在 README 中写入用户未提供的到岗时间或实习周期。

- [ ] **Step 4: 运行完整验证**

依次运行：

```powershell
rg -n "https?://|<script[^>]+src=|<link[^>]+href=|@import" midnight-convenience-store.html
npm test
git diff --check HEAD~1
```

预期：HTML 只保留 data URI 图标中的 `http` 文本，运行时无外部资源；Node/Playwright 测试全部通过；Git diff 无空白错误。用 Playwright CLI 在线打开 GitHub Pages，检查首屏、三日开场、结算和饰品选择的线上版本没有控制台错误。

- [ ] **Step 5: 提交交付版本**

```powershell
git add midnight-convenience-store.html tests/midnight-convenience-store.spec.mjs README.md
git commit -m "feat: complete midnight convenience roguelite loop"
git push origin main
```

---

## 计划自检

- **规格覆盖：** 时间读取在 Task 1；随机顾客和六个事件在 Task 2；隐藏需求和事件修正在 Task 3；品质、三选一、8/3 容量在 Task 4；三日流程和响应式面板在 Task 5 与 Task 7；五种结局和协同在 Task 6；单 HTML、离线和现有回归在 Task 7。
- **占位符检查：** 本计划不使用 TODO、TBD 或“稍后补充”，每个任务提供具体文件、接口、测试和命令。
- **类型一致性：** `state.dailyCustomers`、`state.currentEvent`、`state.trinketChoices`、`getDailySettlement()`、`getTrinketQuality()` 和 `getRunEnding()` 在所有任务中使用同一字段名。
- **风险边界：** 不拆分现有单 HTML，不加入永久存档、网络服务或第三方运行时；若单文件长度明显增加，只允许整理同一 IIFE 内的数据和渲染边界，不做无关重构。
