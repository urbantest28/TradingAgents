# Design Spec: Playwright Test Suite for Trading Reports Viewer

**Date:** 2026-05-25  
**Status:** Approved  
**Author:** Richard Bloom  

---

## 1. Context

The TradingAgents project includes a React-based HTML report viewer served locally at `http://localhost:7788/Trading%20Reports.html`. It is a single-page application with two views:

- **Hub** — lists all analysis reports with search, verdict filter (BUY/HOLD/SELL), and summary stat cards.
- **StoryView** — detail view showing all 5 pipeline stages (Analyst, Research, Trading, Risk, Portfolio), a sticky stage-rail nav, and a "Find in report" search trigger.

The viewer is served by `serve.py` and reads `.md` / `meta.json` files from the `reports/` directory via `fetch()`. The current REPORT_MANIFEST contains 6 reports (RKLB, NOW, NBIS, MSFT, LUNR, IREN).

---

## 2. Goal

Create a Playwright test suite in TypeScript that:
- Demonstrates the Page Object Model pattern (portfolio/learning goal)
- Includes visual regression (screenshot snapshot) tests
- Covers all user-accessible UI flows that work without a live API key
- Can be run with a single `npm test` command

This is a personal development project to build Playwright skills for a professional portfolio.

---

## 3. Architecture Decision

**Classic Page Object Model (TypeScript)**

Page objects are plain TypeScript classes that accept a `Page` instance in the constructor. Spec files import page objects and call their typed methods. This mirrors the Selenium POM pattern the developer already knows, while adopting Playwright idioms (auto-waiting, web-first assertions).

The `playwright.config.ts` `webServer` option auto-starts `python serve.py` before the test run and tears it down after — no manual server management needed.

---

## 4. Directory Structure

```
e2e/
  pages/
    HubPage.ts           # Hub: search, filter, count, open
    StoryPage.ts         # StoryView: header, stages, back, search
  specs/
    hub.spec.ts          # Hub page tests (6 tests)
    navigation.spec.ts   # Hub → StoryView → back navigation (3 tests)
    story.spec.ts        # StoryView content and search (5 tests)
    visual.spec.ts       # Screenshot snapshot baselines (2 tests)
playwright.config.ts     # baseURL, webServer, projects
package.json
tsconfig.json
```

---

## 5. Page Objects

### `HubPage` (`e2e/pages/HubPage.ts`)

```ts
class HubPage {
  constructor(private page: Page) {}

  async goto(): Promise<void>
  async search(query: string): Promise<void>
  async filterByVerdict(verdict: 'ALL' | 'BUY' | 'HOLD' | 'SELL'): Promise<void>
  async getReportCount(): Promise<number>
  async getStatValue(label: string): Promise<string>
  async openReport(ticker: string): Promise<void>
}
```

### `StoryPage` (`e2e/pages/StoryPage.ts`)

```ts
class StoryPage {
  constructor(private page: Page) {}

  async getTicker(): Promise<string>
  async getVerdictLabel(): Promise<string>
  async clickBack(): Promise<void>
  async openSearch(): Promise<void>
  async getStageHeadings(): Promise<string[]>
  async clickStageRail(stageNum: '01' | '02' | '03' | '04' | '05'): Promise<void>
}
```

---

## 6. Test Inventory (16 tests)

### `hub.spec.ts` — Hub page (6 tests)

| # | Test name | Assertion |
|---|-----------|-----------|
| 1 | Hub loads and shows all reports | `getReportCount() === 6` |
| 2 | Summary card shows correct total | `getStatValue("Total Reports") === "6"` |
| 3 | Search by ticker filters rows | `getReportCount() === 1` after searching "MSFT" |
| 4 | Search by company name filters rows | `getReportCount() === 1` after searching "Microsoft" |
| 5 | Verdict filter BUY shows only BUY reports | All visible rows have BUY verdict |
| 6 | Clearing filter (ALL) restores all rows | `getReportCount() === 6` |

### `navigation.spec.ts` — Navigation (3 tests)

| # | Test name | Assertion |
|---|-----------|-----------|
| 7 | Clicking a report card changes the URL hash | `page.url()` contains `#/r/MSFT_` |
| 8 | StoryView loads correct ticker in header | `getTicker() === "MSFT"` |
| 9 | Back button returns to hub | `page.url()` ends with `#/` |

### `story.spec.ts` — StoryView content (5 tests)

| # | Test name | Assertion |
|---|-----------|-----------|
| 10 | Verdict pill is visible and non-empty | `.toBeVisible()` + text not empty |
| 11 | All 5 pipeline stage sections present | `getStageHeadings().length === 5` |
| 12 | Stage rail has 5 navigation items | Rail locator has 5 children |
| 13 | "Find in report" button is visible | `openSearch()` resolves without error |
| 14 | Stage rail click scrolls to that section | Section enters viewport after click |

### `visual.spec.ts` — Screenshots (2 tests)

| # | Test name | Baseline |
|---|-----------|----------|
| 15 | Hub page matches snapshot | `hub-page.png` |
| 16 | MSFT StoryView matches snapshot | `msft-story.png` |

---

## 7. Configuration

### `playwright.config.ts`

```ts
{
  use: { baseURL: 'http://localhost:7788' },
  webServer: {
    command: 'python serve.py',
    url: 'http://localhost:7788',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox',  use: { ...devices['Desktop Firefox'] } },
  ],
  reporter: [['html'], ['list']],
  snapshotDir: 'e2e/snapshots',
}
```

### npm scripts

```json
{
  "test":                  "playwright test",
  "test:ui":               "playwright test --ui",
  "test:headed":           "playwright test --headed",
  "test:update-snapshots": "playwright test --update-snapshots"
}
```

---

## 8. What is Out of Scope

- **Tweaks panel** — not prioritised; can be added in ~30 mins following the same POM pattern
- **Ask panel** — requires a live Claude API key; not testable offline

---

## 9. Expected Test Run Output

```
Running 16 tests using 2 workers

  ✓  hub.spec.ts           (6 passed)
  ✓  navigation.spec.ts    (3 passed)
  ✓  story.spec.ts         (5 passed)
  ✓  visual.spec.ts        (2 passed)

  16 passed (chromium + firefox)
```

Visual test failures show a side-by-side pixel diff in the HTML report (`npx playwright show-report`).

---

## 10. Run Instructions

```bash
# Install dependencies (once)
npm install
npx playwright install

# Run all tests
npm test

# Interactive Playwright UI (recommended for learning)
npm run test:ui

# Watch tests execute in real browser
npm run test:headed

# Regenerate visual baselines after intentional UI changes
npm run test:update-snapshots

# Open HTML report after a test run
npx playwright show-report
```
