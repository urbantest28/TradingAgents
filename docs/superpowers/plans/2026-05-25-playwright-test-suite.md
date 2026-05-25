# Playwright Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 16-test Playwright TypeScript suite using Page Object Model that covers all offline-accessible UI flows of the TradingAgents report viewer.

**Architecture:** Classic POM — `HubPage` and `StoryPage` classes accept a `Page` instance and expose typed methods. Spec files import page objects and make assertions. `playwright.config.ts` auto-starts `python serve.py` via the `webServer` option (local dev: start manually from main project dir since serve.py is not yet in this branch, then `reuseExistingServer` kicks in).

**Tech Stack:** TypeScript, `@playwright/test`, Python HTTP server (serve.py at project root), React SPA at `http://localhost:7788/Trading%20Reports.html`.

---

## App Selector Reference

Collected from reading `app/Hub.jsx`, `app/StoryView.jsx`, `app/ui.jsx`:

| Element | Selector |
|---------|----------|
| Hub search input | `page.getByPlaceholder('Search ticker or company…')` |
| Filter buttons | `page.getByRole('button', { name: 'All' })` (text is capitalized: "All", "Buy", "Hold", "Sell") |
| Run rows (report count) | `page.locator('text=Open →')` — one per report |
| Stat card value | parent div containing label text → sibling div |
| Back button | `page.getByRole('button', { name: '← Hub' })` |
| Ticker in StoryView nav | `page.locator('[style*="Geist Mono"]').filter({ hasText: /^[A-Z]{2,5}$/ }).first()` |
| Verdict pill | `page.locator('span[style*="border-radius: 999px"]').first()` |
| Find-in-report button | `page.locator('[data-find-btn]')` |
| Stage section | `page.locator('#stage-01')` through `#stage-05` |
| Stage rail buttons | `page.locator('button').filter({ has: page.locator('div').filter({ hasText: /^NN$/ }) })` |

**Note on report data:** Tests run against `serve.py` started from the main project dir (all 6 reports in `reports/`). The worktree branch only has MSFT — the server in the main project directory has all 6.

---

## File Map

| Status | Path | Responsibility |
|--------|------|---------------|
| Create | `package.json` | npm scripts + Playwright dep |
| Create | `tsconfig.json` | TypeScript config for e2e/ |
| Create | `playwright.config.ts` | baseURL, webServer, projects |
| Create | `e2e/pages/HubPage.ts` | Hub page object (search, filter, count, open) |
| Create | `e2e/pages/StoryPage.ts` | StoryView page object (ticker, verdict, nav, rail) |
| Create | `e2e/specs/hub.spec.ts` | 6 Hub tests |
| Create | `e2e/specs/navigation.spec.ts` | 3 navigation tests |
| Create | `e2e/specs/story.spec.ts` | 5 StoryView content tests |
| Create | `e2e/specs/visual.spec.ts` | 2 screenshot tests |

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `playwright.config.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "tradingagents-e2e",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "playwright test",
    "test:ui": "playwright test --ui",
    "test:headed": "playwright test --headed",
    "test:update-snapshots": "playwright test --update-snapshots"
  },
  "devDependencies": {
    "@playwright/test": "^1.44.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "strict": true,
    "esModuleInterop": true,
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["e2e/**/*.ts", "playwright.config.ts"]
}
```

- [ ] **Step 3: Create `playwright.config.ts`**

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['list']],
  snapshotDir: 'e2e/snapshots',
  use: {
    baseURL: 'http://localhost:7788',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],
  webServer: {
    command: 'python serve.py',
    url: 'http://localhost:7788',
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
  },
});
```

- [ ] **Step 4: Install dependencies**

```bash
npm install
npx playwright install
```

Expected: node_modules created, Chromium + Firefox browsers downloaded.

- [ ] **Step 5: Commit scaffold**

```bash
git add package.json tsconfig.json playwright.config.ts
git commit -m "feat(e2e): scaffold Playwright project with POM config"
```

---

## Task 2: HubPage object

**Files:**
- Create: `e2e/pages/HubPage.ts`

- [ ] **Step 1: Create `e2e/pages/HubPage.ts`**

```typescript
import { type Page } from '@playwright/test';

export class HubPage {
  constructor(private page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/Trading%20Reports.html');
    // Wait until at least one report row is visible
    await this.page.locator('text=Open →').first().waitFor();
  }

  async search(query: string): Promise<void> {
    const input = this.page.getByPlaceholder('Search ticker or company…');
    await input.clear();
    await input.fill(query);
    // Brief wait for React re-render
    await this.page.waitForTimeout(100);
  }

  async filterByVerdict(verdict: 'ALL' | 'BUY' | 'HOLD' | 'SELL'): Promise<void> {
    const label = verdict === 'ALL'
      ? 'All'
      : verdict.charAt(0) + verdict.slice(1).toLowerCase();
    await this.page.getByRole('button', { name: label, exact: true }).click();
    await this.page.waitForTimeout(100);
  }

  async getReportCount(): Promise<number> {
    // Each run row ends with "Open →" — one per report folder
    return this.page.locator('text=Open →').count();
  }

  async getStatValue(label: string): Promise<string> {
    // Stat component: label div then value div, both inside a parent div
    const statParent = this.page.locator('div').filter({
      has: this.page.getByText(label, { exact: true }),
    }).first();
    const valueEl = statParent.locator('div').nth(1);
    return (await valueEl.textContent())?.trim() ?? '';
  }

  async openReport(ticker: string): Promise<void> {
    // Each ticker group card contains the ticker text and one or more "Open →" run rows
    // Iterate all candidate divs that have "Open →" and find the one containing the ticker
    const candidates = this.page.locator('div').filter({
      has: this.page.getByText('Open →'),
    });
    const count = await candidates.count();
    for (let i = 0; i < count; i++) {
      const el = candidates.nth(i);
      const text = await el.textContent();
      if (text?.includes(ticker)) {
        await el.getByText('Open →').first().click();
        return;
      }
    }
    throw new Error(`Report card for ticker "${ticker}" not found`);
  }
}
```

- [ ] **Step 2: Verify the file has no TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: no output (no errors).

- [ ] **Step 3: Commit**

```bash
git add e2e/pages/HubPage.ts
git commit -m "feat(e2e): add HubPage page object"
```

---

## Task 3: StoryPage object

**Files:**
- Create: `e2e/pages/StoryPage.ts`

- [ ] **Step 1: Create `e2e/pages/StoryPage.ts`**

```typescript
import { type Page } from '@playwright/test';

export class StoryPage {
  constructor(private page: Page) {}

  async getTicker(): Promise<string> {
    // The ticker in the top nav bar is a monospace div containing only uppercase letters
    // React renders fontFamily: "Geist Mono, monospace" as an inline style
    const tickerEl = this.page.locator('[style*="Geist Mono"]').filter({
      hasText: /^[A-Z]{2,5}$/,
    }).first();
    await tickerEl.waitFor();
    return (await tickerEl.textContent())?.trim() ?? '';
  }

  async getVerdictLabel(): Promise<string> {
    // Pill component renders as a <span> with borderRadius: 999 (→ border-radius: 999px in DOM)
    // The verdict pill is the first such span in the document (in the top nav bar)
    const pill = this.page.locator('span[style*="border-radius: 999px"]').first();
    await pill.waitFor();
    return (await pill.textContent())?.trim() ?? '';
  }

  async clickBack(): Promise<void> {
    await this.page.getByRole('button', { name: '← Hub' }).click();
  }

  async openSearch(): Promise<void> {
    // The "Find in report" button has data-find-btn attribute
    await this.page.locator('[data-find-btn]').click();
    // Wait for search overlay to appear
    await this.page.locator('input[placeholder="Find in report…"]').waitFor();
  }

  async getStageHeadings(): Promise<string[]> {
    // Stage component structure: #stage-NN > div (flex row) > div (label+caption) > div:first (label)
    const headings: string[] = [];
    for (const num of ['01', '02', '03', '04', '05']) {
      const stageEl = this.page.locator(`#stage-${num}`);
      await stageEl.waitFor({ state: 'attached' });
      // Path into the stage header: first child div > last child div > first child div
      const headerRow = stageEl.locator('> div').first();
      const labelContainer = headerRow.locator('> div').last();
      const labelEl = labelContainer.locator('> div').first();
      const text = await labelEl.textContent();
      headings.push(text?.trim() ?? '');
    }
    return headings;
  }

  async clickStageRail(stageNum: '01' | '02' | '03' | '04' | '05'): Promise<void> {
    // Stage rail buttons contain the step number in an inner div
    // Filter: find a button whose child div has text exactly matching the stage number
    const railBtn = this.page.locator('button').filter({
      has: this.page.locator('div').filter({ hasText: new RegExp(`^${stageNum}$`) }),
    }).first();
    await railBtn.click();
    // Wait for scroll animation to settle
    await this.page.waitForTimeout(400);
  }
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add e2e/pages/StoryPage.ts
git commit -m "feat(e2e): add StoryPage page object"
```

---

## Task 4: Hub spec (6 tests)

**Pre-condition:** `serve.py` must be running from the main project directory before running tests locally.
Start it with: `python "C:\Users\richa.RSB\OneDrive\Desktop\TradingAgents\serve.py"`

**Files:**
- Create: `e2e/specs/hub.spec.ts`

- [ ] **Step 1: Create `e2e/specs/hub.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';
import { HubPage } from '../pages/HubPage';

test.describe('Hub page', () => {
  test('Hub loads and shows all reports', async ({ page }) => {
    const hub = new HubPage(page);
    await hub.goto();
    const count = await hub.getReportCount();
    expect(count).toBe(6);
  });

  test('Summary card shows correct total', async ({ page }) => {
    const hub = new HubPage(page);
    await hub.goto();
    const total = await hub.getStatValue('Total Reports');
    expect(total).toBe('6');
  });

  test('Search by ticker filters rows', async ({ page }) => {
    const hub = new HubPage(page);
    await hub.goto();
    await hub.search('MSFT');
    const count = await hub.getReportCount();
    expect(count).toBe(1);
  });

  test('Search by company name filters rows', async ({ page }) => {
    const hub = new HubPage(page);
    await hub.goto();
    await hub.search('Microsoft');
    const count = await hub.getReportCount();
    expect(count).toBe(1);
  });

  test('Verdict filter BUY shows only BUY reports', async ({ page }) => {
    const hub = new HubPage(page);
    await hub.goto();
    await hub.filterByVerdict('BUY');
    const count = await hub.getReportCount();
    // At least one BUY report exists and at least one non-BUY was filtered out
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(6);
  });

  test('Clearing filter (ALL) restores all rows', async ({ page }) => {
    const hub = new HubPage(page);
    await hub.goto();
    await hub.filterByVerdict('BUY');
    await hub.filterByVerdict('ALL');
    const count = await hub.getReportCount();
    expect(count).toBe(6);
  });
});
```

- [ ] **Step 2: Run the hub tests against the live server**

Ensure `serve.py` is running, then:
```bash
npm test -- e2e/specs/hub.spec.ts --project=chromium
```

Expected: 6 passed.

If a test fails, debug:
- "Hub loads" fails → check the server is running and manifest has 6 entries
- "Total Reports" fails → stat selector is wrong; inspect DOM for "Total Reports" label  
- Search fails → check placeholder text matches exactly (copy from Hub.jsx)
- Filter fails → check filter button text ("All", "Buy", "Hold", "Sell")

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/hub.spec.ts
git commit -m "test(e2e): add hub.spec.ts — 6 Hub page tests"
```

---

## Task 5: Navigation spec (3 tests)

**Files:**
- Create: `e2e/specs/navigation.spec.ts`

- [ ] **Step 1: Create `e2e/specs/navigation.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';
import { HubPage } from '../pages/HubPage';
import { StoryPage } from '../pages/StoryPage';

test.describe('Hub → StoryView navigation', () => {
  test('Clicking a report card changes the URL hash', async ({ page }) => {
    const hub = new HubPage(page);
    await hub.goto();
    await hub.openReport('MSFT');
    await expect(page).toHaveURL(/#\/r\/MSFT_/);
  });

  test('StoryView loads correct ticker in header', async ({ page }) => {
    const hub = new HubPage(page);
    await hub.goto();
    await hub.openReport('MSFT');
    const story = new StoryPage(page);
    const ticker = await story.getTicker();
    expect(ticker).toBe('MSFT');
  });

  test('Back button returns to hub', async ({ page }) => {
    const hub = new HubPage(page);
    await hub.goto();
    await hub.openReport('MSFT');
    const story = new StoryPage(page);
    // Wait for StoryView to fully load before going back
    await story.getTicker(); // waits for ticker element
    await story.clickBack();
    await expect(page).toHaveURL(/#\/$/);
  });
});
```

- [ ] **Step 2: Run navigation tests**

```bash
npm test -- e2e/specs/navigation.spec.ts --project=chromium
```

Expected: 3 passed.

If hash URL test fails: the app uses `window.location.hash = \`/r/${encodeURIComponent(folder)}\`` — the URL will be `#/r/MSFT_20260519_215050`. The regex `/#\/r\/MSFT_/` should match. Inspect actual URL with `console.log(page.url())` if needed.

If back button fails: wait for the hub to re-render after navigation — add `await page.locator('text=Open →').first().waitFor()` after `clickBack()` before asserting URL.

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/navigation.spec.ts
git commit -m "test(e2e): add navigation.spec.ts — Hub → StoryView → back (3 tests)"
```

---

## Task 6: Story spec (5 tests)

**Files:**
- Create: `e2e/specs/story.spec.ts`

- [ ] **Step 1: Create `e2e/specs/story.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';
import { HubPage } from '../pages/HubPage';
import { StoryPage } from '../pages/StoryPage';

test.describe('StoryView content', () => {
  // Navigate to MSFT StoryView before each test
  test.beforeEach(async ({ page }) => {
    const hub = new HubPage(page);
    await hub.goto();
    await hub.openReport('MSFT');
    // Wait for the report to fully load (stage-01 indicates content rendered)
    await page.locator('#stage-01').waitFor();
  });

  test('Verdict pill is visible and non-empty', async ({ page }) => {
    const story = new StoryPage(page);
    const label = await story.getVerdictLabel();
    expect(label.length).toBeGreaterThan(0);
    await expect(page.locator('span[style*="border-radius: 999px"]').first()).toBeVisible();
  });

  test('All 5 pipeline stage sections present', async ({ page }) => {
    const story = new StoryPage(page);
    const headings = await story.getStageHeadings();
    expect(headings.length).toBe(5);
    // Verify each heading is non-empty
    for (const h of headings) {
      expect(h.length).toBeGreaterThan(0);
    }
  });

  test('Stage rail has 5 navigation items', async ({ page }) => {
    // Stage rail is the fixed left sidebar with buttons "01"–"05"
    // Each button contains a circle div with the step number
    const railButtons = page.locator('button').filter({
      has: page.locator('div').filter({ hasText: /^0[1-5]$/ }),
    });
    await expect(railButtons).toHaveCount(5);
  });

  test('"Find in report" button is visible and opens search', async ({ page }) => {
    const story = new StoryPage(page);
    await expect(page.locator('[data-find-btn]')).toBeVisible();
    await story.openSearch();
    // Search overlay input should appear
    await expect(page.locator('input[placeholder="Find in report…"]')).toBeVisible();
  });

  test('Stage rail click scrolls to that section', async ({ page }) => {
    const story = new StoryPage(page);
    // Click stage 04 (Risk Committee) — far enough down to require scrolling
    await story.clickStageRail('04');
    // The stage section should now be in the viewport
    const stageEl = page.locator('#stage-04');
    await expect(stageEl).toBeInViewport();
  });
});
```

- [ ] **Step 2: Run story tests**

```bash
npm test -- e2e/specs/story.spec.ts --project=chromium
```

Expected: 5 passed.

Common failure points:
- "All 5 pipeline stage sections present" fails → `getStageHeadings()` selector path is wrong. Open `--headed` and use Playwright Inspector (`page.pause()`) to inspect `#stage-01 > div > div > div` path.
- "Stage rail has 5 navigation items" fails → the `0[1-5]` regex filter may be too broad or too narrow. Verify with `page.locator('button').filter({has: page.locator('div').filter({hasText: /^01$/})}).count()`.
- "Stage rail click scrolls" fails → scroll happens inside `#story-scroller` div, not the window. `toBeInViewport()` checks visibility relative to viewport. If this fails, increase `waitForTimeout` in `clickStageRail()` to 600ms.

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/story.spec.ts
git commit -m "test(e2e): add story.spec.ts — StoryView content and search (5 tests)"
```

---

## Task 7: Visual regression spec (2 tests)

**Files:**
- Create: `e2e/specs/visual.spec.ts`

- [ ] **Step 1: Create `e2e/specs/visual.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';
import { HubPage } from '../pages/HubPage';

test.describe('Visual regression', () => {
  test('Hub page matches snapshot', async ({ page }) => {
    const hub = new HubPage(page);
    await hub.goto();
    // Wait for all stat cards to render (ensures fonts + data loaded)
    await page.getByText('Total Reports').waitFor();
    await expect(page).toHaveScreenshot('hub-page.png', {
      fullPage: false,
      // Mask the timestamp in report rows — they would make snapshots flicker
      mask: [],
    });
  });

  test('MSFT StoryView matches snapshot', async ({ page }) => {
    const hub = new HubPage(page);
    await hub.goto();
    await hub.openReport('MSFT');
    // Wait for all stage sections to render
    await page.locator('#stage-05').waitFor();
    await expect(page).toHaveScreenshot('msft-story.png', {
      fullPage: false,
    });
  });
});
```

- [ ] **Step 2: Generate baseline snapshots (first run always fails, then updates)**

```bash
npm run test:update-snapshots -- e2e/specs/visual.spec.ts --project=chromium
```

Expected: creates `e2e/snapshots/visual.spec.ts-snapshots/hub-page-chromium.png` and `msft-story-chromium.png`. Command exits 0.

- [ ] **Step 3: Run visual tests to verify baselines pass**

```bash
npm test -- e2e/specs/visual.spec.ts --project=chromium
```

Expected: 2 passed.

- [ ] **Step 4: Commit with snapshots**

```bash
git add e2e/specs/visual.spec.ts e2e/snapshots/
git commit -m "test(e2e): add visual.spec.ts — Hub and MSFT StoryView screenshot baselines"
```

---

## Task 8: Full run and final commit

- [ ] **Step 1: Run all tests on Chromium**

Ensure `serve.py` is running, then:
```bash
npm test -- --project=chromium
```

Expected output:
```
Running 16 tests using 2 workers

  ✓  hub.spec.ts           (6 passed)
  ✓  navigation.spec.ts    (3 passed)
  ✓  story.spec.ts         (5 passed)
  ✓  visual.spec.ts        (2 passed)

  16 passed
```

- [ ] **Step 2: Run on Firefox**

```bash
npm test -- --project=firefox
```

Expected: same 16 tests pass. Visual baselines are per-browser — on first Firefox run, generate Firefox baselines:
```bash
npm run test:update-snapshots -- e2e/specs/visual.spec.ts --project=firefox
```

- [ ] **Step 3: View HTML report**

```bash
npx playwright show-report
```

Expected: browser opens showing 16 passing tests with timing and trace info.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "test(e2e): complete Playwright POM suite — 16 tests, visual baselines"
```

---

## Self-Review

**Spec coverage check:**

| Spec Section | Covered by |
|---|---|
| §3 Classic POM, TypeScript | `HubPage.ts`, `StoryPage.ts` |
| §4 Directory structure | All 9 files created as specced |
| §5 HubPage interface | Task 2 — all 6 methods implemented |
| §5 StoryPage interface | Task 3 — all 6 methods implemented |
| §6 hub.spec.ts (6 tests) | Task 4 |
| §6 navigation.spec.ts (3 tests) | Task 5 |
| §6 story.spec.ts (5 tests) | Task 6 |
| §6 visual.spec.ts (2 tests) | Task 7 |
| §7 playwright.config.ts | Task 1 |
| §7 npm scripts (4 scripts) | Task 1 |
| §10 Run instructions | Task 8 |
| Out of scope: Tweaks, Ask panel | Intentionally omitted |

**Type consistency check:** `HubPage.openReport(ticker: string)` called in all specs with string — ✓. `StoryPage.clickStageRail(stageNum: '01'|...'05')` called with string literals — ✓. `filterByVerdict('BUY'|...)` called correctly — ✓.

**Placeholder scan:** No TBDs. All steps have complete code. ✓

**Known limitation:** Test 5 ("Verdict filter BUY shows only BUY reports") asserts count > 0 && count < 6 rather than inspecting verdict labels on each card, because the raw rating strings ("Strong Buy", "Overweight", etc.) are data-dependent. Adding `data-verdict-kind` attributes to card elements would make this fully assertable without changing test reliability.
