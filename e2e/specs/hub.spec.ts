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

  test('Verdict filter HOLD shows only HOLD reports', async ({ page }) => {
    const hub = new HubPage(page);
    await hub.goto();
    await hub.filterByVerdict('HOLD');
    const count = await hub.getReportCount();
    // At least one HOLD report exists and at least one non-HOLD was filtered out
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(6);
  });

  test('Clearing filter (ALL) restores all rows', async ({ page }) => {
    const hub = new HubPage(page);
    await hub.goto();
    await hub.filterByVerdict('HOLD');
    await hub.filterByVerdict('ALL');
    const count = await hub.getReportCount();
    expect(count).toBe(6);
  });
});
