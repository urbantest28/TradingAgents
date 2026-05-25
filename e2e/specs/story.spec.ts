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
