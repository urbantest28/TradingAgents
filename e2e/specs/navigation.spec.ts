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
    await story.getTicker();
    await story.clickBack();
    await expect(page).toHaveURL(/#\/$/);
  });
});
