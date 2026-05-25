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
    // Each ticker group card contains the ticker text and one or more "Open →" run rows.
    // Iterate all candidate divs that have "Open →" and find the one containing the ticker.
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
