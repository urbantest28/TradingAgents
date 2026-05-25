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
