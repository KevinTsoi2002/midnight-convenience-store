# 《凌晨 2:17 的便利店》Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished 3–5 minute narrative microgame that runs from one self-contained HTML file and lets the player serve three late-night customers by selecting three products for each.

**Architecture:** Keep the deliverable intentionally small: one `midnight-convenience-store.html` containing semantic markup, CSS tokens/layout, data-driven game content, a centralized state object, render functions, scoring, feedback, endings, and optional Web Audio effects. Use black-box Playwright checks against the HTML file so the final artifact is validated without adding a runtime dependency or backend.

**Tech Stack:** HTML5, CSS custom properties, vanilla JavaScript, Web Audio API, Playwright for browser verification.

---

## File Structure

- Create: `midnight-convenience-store.html`
  - The only user-facing deliverable.
  - Contains all HTML, CSS, JavaScript, copy, and inline SVG/CSS product illustrations.
- Create: `tests/midnight-convenience-store.spec.mjs`
  - Playwright smoke and interaction checks.
  - Not shipped as part of the final link.

The project currently has no Git metadata, so implementation checkpoints should be verified with file diffs and test output rather than commits.

### Task 1: Establish the semantic app shell and visual tokens

**Files:**
- Create: `midnight-convenience-store.html`
- Test: `tests/midnight-convenience-store.spec.mjs`

- [ ] **Step 1: Write the failing browser smoke test**

Create a Playwright test that opens the local HTML file and expects the initial screen to expose the app title, a start button, a mute button, and no product grid before the game starts:

```js
import { test, expect } from '@playwright/test';

const htmlUrl = new URL('../midnight-convenience-store.html', import.meta.url).href;

test('shows the intro screen', async ({ page }) => {
  await page.goto(htmlUrl);
  await expect(page.getByRole('heading', { name: '凌晨 2:17 的便利店' })).toBeVisible();
  await expect(page.getByRole('button', { name: '开始值班' })).toBeVisible();
  await expect(page.getByRole('button', { name: /声音/ })).toBeVisible();
  await expect(page.locator('[data-product-grid]')).toBeHidden();
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npx playwright test tests/midnight-convenience-store.spec.mjs --project=chromium
```

Expected: FAIL because `midnight-convenience-store.html` does not exist.

- [ ] **Step 3: Add the initial HTML structure**

Create a complete document with:

```html
<main id="app" data-screen="intro">
  <section data-screen-panel="intro" aria-labelledby="game-title">
    <p class="eyebrow">NIGHT SHIFT / 02:17</p>
    <h1 id="game-title">凌晨 2:17 的便利店</h1>
    <p class="intro-copy">给今晚还没结束的人，装一袋刚刚好的东西。</p>
    <button type="button" data-action="start">开始值班</button>
  </section>

  <section data-screen-panel="game" hidden aria-live="polite">
    <header class="topbar">
      <span data-clock>02:17</span>
      <span data-customer-progress>01 / 03</span>
      <button type="button" data-action="toggle-audio" aria-pressed="false">声音：关</button>
    </header>
    <div class="game-layout">
      <section data-store-stage aria-label="便利店场景"></section>
      <aside data-customer-panel></aside>
    </div>
    <section data-product-grid hidden aria-label="商品货架"></section>
    <section data-bag aria-label="当前购物袋"></section>
    <button type="button" data-action="submit-bag" disabled>装袋</button>
  </section>

  <section data-screen-panel="ending" hidden aria-live="polite"></section>
</main>
```

Add CSS custom properties for the approved palette:

```css
:root {
  --ink: #0d1718;
  --panel: #16292a;
  --panel-raised: #1f3533;
  --lime: #b8d65a;
  --cream: #e9f4dd;
  --coral: #ed7657;
  --muted: #8fa9a0;
  --line: rgba(233, 244, 221, 0.18);
}
```

Use CSS grid for the desktop split layout, a single-column mobile breakpoint, stable product card dimensions, visible focus styles, and `hidden`/`aria-live` semantics. Do not load any external font, image, stylesheet, or script.

- [ ] **Step 4: Run the smoke test and verify it passes**

Run the same Playwright command. Expected: PASS for the intro screen.

### Task 2: Define data models, state, and deterministic scoring

**Files:**
- Modify: `midnight-convenience-store.html`
- Test: `tests/midnight-convenience-store.spec.mjs`

- [ ] **Step 1: Add a failing interaction contract**

Append this test:

```js
test('starts the first customer with a three-item bag target', async ({ page }) => {
  await page.goto(htmlUrl);
  await page.getByRole('button', { name: '开始值班' }).click();

  await expect(page.locator('[data-screen-panel="game"]')).toBeVisible();
  await expect(page.getByText('阿成')).toBeVisible();
  await expect(page.locator('[data-product-card]')).toHaveCount(9);
  await expect(page.locator('[data-bag-count]')).toHaveText('0 / 3');
  await expect(page.getByRole('button', { name: '装袋' })).toBeDisabled();
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npx playwright test tests/midnight-convenience-store.spec.mjs --project=chromium
```

Expected: FAIL because the start action does not yet render customer data or product cards.

- [ ] **Step 3: Add explicit data definitions**

Inside the inline script, define:

```js
const products = [
  { id: 'coffee', name: '热咖啡', icon: '☕', tags: ['warmth', 'energy'] },
  { id: 'milk', name: '蜂蜜牛奶', icon: '◒', tags: ['warmth', 'comfort'] },
  { id: 'bar', name: '能量棒', icon: '▰', tags: ['energy', 'practical'] },
  { id: 'warmer', name: '暖手贴', icon: '✦', tags: ['warmth', 'comfort'] },
  { id: 'gum', name: '口香糖', icon: '○', tags: ['energy'] },
  { id: 'magazine', name: '杂志', icon: '▤', tags: ['company'] },
  { id: 'umbrella', name: '小雨伞', icon: '⌁', tags: ['practical', 'comfort'] },
  { id: 'battery', name: '电池', icon: '▥', tags: ['light', 'practical'] },
  { id: 'hot-food', name: '热食', icon: '▣', tags: ['warmth', 'company'] }
];

const customers = [
  {
    id: 'cheng',
    name: '阿成',
    role: '外卖员',
    line: '还有一单。手有点冷。',
    needs: ['warmth', 'energy'],
    response: {
      high: '他把暖手贴贴在掌心，终于松了一下肩膀。',
      mid: '他点点头，说了声谢谢，又看向门外。',
      low: '他把袋子挂在车把上，风很快又把门吹开了。'
    }
  },
  {
    id: 'xiaoyu',
    name: '小雨',
    role: '学生',
    line: '我不饿，只想买点能带走的光。',
    needs: ['light', 'company'],
    response: {
      high: '她把电池放进口袋，像是终于有了一盏备用的小灯。',
      mid: '她在货架前多站了一会儿，然后轻轻挥了挥手。',
      low: '她拿着袋子，却没有立刻走进雨里。'
    }
  },
  {
    id: 'unnamed',
    name: '没有名字的人',
    role: '等雨的人',
    line: '雨停了我就走。',
    needs: ['comfort', 'company'],
    response: {
      high: '他在靠窗的位置坐下，雨声变得没有那么远了。',
      mid: '他看了看雨幕，说：“这里挺亮的。”',
      low: '他站在门边，像是在等一句还没有说出口的话。'
    }
  }
];

const state = {
  screen: 'intro',
  customerIndex: 0,
  selectedProductIds: [],
  roundScores: [],
  audioEnabled: false,
  showFeedback: false,
  lastFeedback: null,
  receipt: []
};
```

Add pure helpers:

```js
function scoreSelection(customer, selectedIds) {
  const selectedTags = new Set(
    products
      .filter((product) => selectedIds.includes(product.id))
      .flatMap((product) => product.tags)
  );
  return customer.needs.reduce((score, need) => score + (selectedTags.has(need) ? 1 : 0), 0);
}

function responseLevel(score) {
  return score >= 2 ? 'high' : score === 1 ? 'mid' : 'low';
}

function getEnding(roundScores) {
  const total = roundScores.reduce((sum, score) => sum + score, 0);
  if (total >= 6) return 'bright';
  if (total >= 3) return 'rain';
  return 'stay';
}
```

- [ ] **Step 4: Implement start/reset state transitions**

Implement `startGame()` and `resetGame()` so they always replace the relevant state fields. A submission pauses on a feedback beat; the explicit `继续` action advances to the next customer or ending:

```js
function startGame() {
  state.screen = 'game';
  state.customerIndex = 0;
  state.selectedProductIds = [];
  state.roundScores = [];
  state.showFeedback = false;
  state.lastFeedback = null;
  state.receipt = [];
  render();
}

function resetGame() {
  state.screen = 'intro';
  state.customerIndex = 0;
  state.selectedProductIds = [];
  state.roundScores = [];
  state.showFeedback = false;
  state.lastFeedback = null;
  state.receipt = [];
  render();
}
```

Bind the intro button to `startGame()` and the ending button to `resetGame()`. Render the correct panel by setting `hidden` and `data-screen`.

- [ ] **Step 5: Run the interaction test and verify it passes**

Run:

```powershell
npx playwright test tests/midnight-convenience-store.spec.mjs --project=chromium
```

Expected: PASS for the first-customer contract.

### Task 3: Implement product selection, bag limits, and customer progression

**Files:**
- Modify: `midnight-convenience-store.html`
- Test: `tests/midnight-convenience-store.spec.mjs`

- [ ] **Step 1: Add failing tests for the three-item rule**

Append:

```js
test('allows exactly three products and enables bag submission', async ({ page }) => {
  await page.goto(htmlUrl);
  await page.getByRole('button', { name: '开始值班' }).click();

  const cards = page.locator('[data-product-card]');
  await cards.nth(0).click();
  await cards.nth(1).click();
  await cards.nth(2).click();

  await expect(page.locator('[data-bag-count]')).toHaveText('3 / 3');
  await expect(page.getByRole('button', { name: '装袋' })).toBeEnabled();

  await cards.nth(3).click();
  await expect(page.locator('[data-bag-count]')).toHaveText('3 / 3');
});

test('submitting advances through all three customers and shows an ending', async ({ page }) => {
  await page.goto(htmlUrl);
  await page.getByRole('button', { name: '开始值班' }).click();

  for (let round = 0; round < 3; round += 1) {
    const cards = page.locator('[data-product-card]');
    await cards.nth(0).click();
    await cards.nth(1).click();
    await cards.nth(2).click();
    await page.getByRole('button', { name: '装袋' }).click();
    if (round < 2) {
      await page.getByRole('button', { name: '继续' }).click();
      await expect(page.locator('[data-customer-progress]')).toHaveText(`${String(round + 2).padStart(2, '0')} / 03`);
    } else {
      await page.getByRole('button', { name: '继续' }).click();
    }
  }

  await expect(page.locator('[data-screen-panel="ending"]')).toBeVisible();
  await expect(page.getByRole('button', { name: '再来一晚' })).toBeVisible();
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```powershell
npx playwright test tests/midnight-convenience-store.spec.mjs --project=chromium
```

Expected: FAIL because product cards do not yet update the bag or advance customers.

- [ ] **Step 3: Render product cards and bag state**

Implement `renderProducts()` with a real button per product:

```js
function renderProducts() {
  productGrid.innerHTML = products.map((product) => `
    <button
      type="button"
      class="product-card${state.selectedProductIds.includes(product.id) ? ' is-selected' : ''}"
      data-product-card
      data-product-id="${product.id}"
      aria-pressed="${state.selectedProductIds.includes(product.id)}"
    >
      <span class="product-icon" aria-hidden="true">${product.icon}</span>
      <span class="product-name">${product.name}</span>
    </button>
  `).join('');
}
```

Implement `renderBag()` so it displays selected product names, a `data-bag-count` element, and an empty state when no products are selected.

- [ ] **Step 4: Implement selection and submission**

Use event delegation:

```js
productGrid.addEventListener('click', (event) => {
  const card = event.target.closest('[data-product-card]');
  if (!card || state.screen !== 'game' || state.showFeedback) return;

  const productId = card.dataset.productId;
  const selected = state.selectedProductIds;
  const existingIndex = selected.indexOf(productId);

  if (existingIndex >= 0) {
    selected.splice(existingIndex, 1);
  } else if (selected.length < 3) {
    selected.push(productId);
  }

  render();
});

submitButton.addEventListener('click', () => {
  if (state.selectedProductIds.length !== 3 || state.showFeedback) return;
  const customer = customers[state.customerIndex];
  const score = scoreSelection(customer, state.selectedProductIds);
  state.roundScores.push(score);
  state.lastFeedback = customer.response[responseLevel(score)];
  state.receipt.push({
    customerName: customer.name,
    productIds: [...state.selectedProductIds],
    score
  });
  state.showFeedback = true;
  render();
});

continueButton.addEventListener('click', () => {
  if (!state.showFeedback) return;
  state.showFeedback = false;
  state.customerIndex += 1;
  state.selectedProductIds = [];
  state.lastFeedback = null;
  state.screen = state.customerIndex >= customers.length ? 'ending' : 'game';
  render();
});
```

- [ ] **Step 5: Run the tests and verify they pass**

Run:

```powershell
npx playwright test tests/midnight-convenience-store.spec.mjs --project=chromium
```

Expected: PASS for the three-item limit, customer progression, and ending visibility.

### Task 4: Add customer feedback, receipts, endings, and replay

**Files:**
- Modify: `midnight-convenience-store.html`
- Test: `tests/midnight-convenience-store.spec.mjs`

- [ ] **Step 1: Add failing tests for visible feedback and reset**

Append:

```js
test('shows customer feedback after submitting a bag and resets cleanly', async ({ page }) => {
  await page.goto(htmlUrl);
  await page.getByRole('button', { name: '开始值班' }).click();

  const cards = page.locator('[data-product-card]');
  await cards.nth(0).click();
  await cards.nth(1).click();
  await cards.nth(2).click();
  await page.getByRole('button', { name: '装袋' }).click();

  await expect(page.locator('[data-feedback]')).toBeVisible();
  await expect(page.locator('[data-receipt]')).toContainText('阿成');
  await page.getByRole('button', { name: '继续' }).click();

  for (let round = 1; round < 3; round += 1) {
    const nextCards = page.locator('[data-product-card]');
    await nextCards.nth(0).click();
    await nextCards.nth(1).click();
    await nextCards.nth(2).click();
    await page.getByRole('button', { name: '装袋' }).click();
    await page.getByRole('button', { name: '继续' }).click();
  }

  await page.getByRole('button', { name: '再来一晚' }).click();
  await expect(page.locator('[data-screen-panel="intro"]')).toBeVisible();
  await expect(page.locator('[data-product-grid]')).toBeHidden();
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npx playwright test tests/midnight-convenience-store.spec.mjs --project=chromium
```

Expected: FAIL because feedback, receipt, and ending content are not yet rendered.

- [ ] **Step 3: Render the current customer and round feedback**

Implement `renderCustomer()` with the customer name, role, line, a non-color-only status cue, and a feedback region:

```js
function renderCustomer() {
  const customer = customers[state.customerIndex];
  customerPanel.innerHTML = `
    <p class="customer-index">CUSTOMER ${String(state.customerIndex + 1).padStart(2, '0')}</p>
    <h2>${customer.name}</h2>
    <p class="customer-role">${customer.role}</p>
    <blockquote>${customer.line}</blockquote>
    <p class="customer-hint">听一听他没有说完的那一半。</p>
    <div data-feedback ${state.showFeedback ? '' : 'hidden'}>${state.lastFeedback ?? ''}</div>
    <button type="button" data-action="continue" ${state.showFeedback ? '' : 'hidden'}>继续</button>
  `;
}
```

After submission, keep the current response in `state.lastFeedback` and pause the round until the player clicks `继续`. Render it into `[data-feedback]` and append a receipt entry with customer name, selected product names, and the numeric score translated into a short non-numeric phrase. While feedback is visible, hide or disable product selection and the `装袋` button.

- [ ] **Step 4: Render all three endings**

Define ending copy keyed by `getEnding(state.roundScores)`:

```js
const endings = {
  bright: {
    title: '今晚的灯一直亮着',
    copy: '你没有解决所有人的夜晚。\\n但至少，每个人都拿到了一点可以继续走下去的东西。'
  },
  rain: {
    title: '雨停了，但店里还有人',
    copy: '有些帮助不会立刻变成答案。\\n它只是让等待的时候，没有那么冷。'
  },
  stay: {
    title: '打烊之前，请再坐一会儿',
    copy: '门外还是凌晨。\\n不过这家店，暂时还没有关灯。'
  }
};
```

Render `data-receipt`, the ending title/copy, and the replay button. Ensure `getEnding()` is deterministic for the same score array.

- [ ] **Step 5: Run the tests and verify they pass**

Run:

```powershell
npx playwright test tests/midnight-convenience-store.spec.mjs --project=chromium
```

Expected: PASS for feedback, receipt, ending, and clean replay.

### Task 5: Add atmosphere, audio fallback, and responsive polish

**Files:**
- Modify: `midnight-convenience-store.html`
- Test: `tests/midnight-convenience-store.spec.mjs`

- [ ] **Step 1: Add failing offline and responsive checks**

Append:

```js
test('does not request external resources', async ({ page }) => {
  const externalRequests = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('file://')) externalRequests.push(request.url());
  });
  await page.goto(htmlUrl);
  expect(externalRequests).toEqual([]);
});

test('fits the game on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(htmlUrl);
  await page.getByRole('button', { name: '开始值班' }).click();

  const overflow = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth
  }));
  expect(overflow.width).toBeLessThanOrEqual(overflow.viewport);
});
```

- [ ] **Step 2: Run the tests and verify the new checks fail or expose gaps**

Run:

```powershell
npx playwright test tests/midnight-convenience-store.spec.mjs --project=chromium
```

Expected: the offline check should pass already; the narrow viewport check may fail until responsive CSS is complete. Record any failing selector or overflow measurement before editing.

- [ ] **Step 3: Add the approved visual system**

Implement:

- CSS shelf rows with stable height.
- Fluorescent strip lights using solid colors and restrained box shadows.
- Product cards with lime selected state and a secondary icon/label state.
- Coral feedback accent used sparingly.
- A small rain layer made with CSS repeating gradients, not a large decorative overlay.
- `prefers-reduced-motion` rules that disable nonessential transforms and flicker.

Use `clamp()` only for bounded layout dimensions, not for continuously scaling text. Keep heading sizes at explicit responsive breakpoints.

- [ ] **Step 4: Add audio initialization with graceful fallback**

Implement:

```js
let audioContext;

function setAudioEnabled(enabled) {
  state.audioEnabled = enabled;
  if (enabled && !audioContext) {
    try {
      audioContext = new AudioContext();
    } catch {
      audioContext = null;
      state.audioEnabled = false;
    }
  }
  renderAudioButton();
}
```

Only create or resume the context after the user clicks the audio button. If it fails, keep the game usable and show `声音：不可用` rather than throwing.

- [ ] **Step 5: Run the full browser suite**

Run:

```powershell
npx playwright test tests/midnight-convenience-store.spec.mjs --project=chromium
```

Expected: all tests pass at desktop and narrow viewport sizes.

### Task 6: Perform final single-file and runtime verification

**Files:**
- Modify: `midnight-convenience-store.html` only if verification finds a defect.
- Test: `tests/midnight-convenience-store.spec.mjs`

- [ ] **Step 1: Verify the artifact contains no external dependencies**

Run:

```powershell
rg -n "https?://|<script[^>]+src=|<link[^>]+href=|@import" midnight-convenience-store.html
```

Expected: no matches.

- [ ] **Step 2: Run a complete end-to-end replay**

Run:

```powershell
npx playwright test tests/midnight-convenience-store.spec.mjs --project=chromium
```

Expected: all tests pass, including intro, product limit, three-customer progression, feedback, ending, replay, offline, and mobile overflow checks.

- [ ] **Step 3: Inspect the final HTML directly**

Run:

```powershell
Get-Item .\midnight-convenience-store.html | Select-Object FullName, Length
Get-Content .\midnight-convenience-store.html -TotalCount 40
```

Confirm that the file is a complete `<!doctype html>` document and that no debug text, test-only banner, or unfinished placeholder remains.

- [ ] **Step 4: Manual acceptance pass**

Open the file in a real browser and verify:

1. Intro title and start action are immediately clear.
2. Selecting and deselecting products updates the bag.
3. A fourth product cannot be selected.
4. Each submission changes the customer and receipt.
5. The ending copy appears after the third customer.
6. Replay returns to a clean intro state.
7. Audio toggle never blocks progression.
8. The mobile layout has no overlapping text or clipped controls.

The final deliverable is `midnight-convenience-store.html`; send that file through a static hosting link or the interview platform’s file/link mechanism.

## Execution Record

- Implemented in `midnight-convenience-store.html`.
- Added browser regression coverage in `tests/midnight-convenience-store.spec.mjs`.
- Final verification: 22 tests passed.
- Browser/IAB verification: title, intro, game flow, console health, desktop/mobile screenshots, and no horizontal overflow.
- Intentional deviation: the accepted visual direction is implemented with inline SVG/CSS artwork instead of raster assets so the final artifact remains one offline HTML file.
