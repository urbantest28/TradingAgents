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
    // Stat component: label div and value div are adjacent siblings inside the same parent.
    // getByText(exact) returns the small label div; following-sibling gets the value div.
    const labelEl = this.page.getByText(label, { exact: true });
    const valueEl = labelEl.locator('xpath=following-sibling::div[1]');
    return (await valueEl.textContent())?.trim() ?? '';
  }

  async openReport(ticker: string): Promise<void> {
    // Hub structure: Card div > header row div > left-side div > ticker heading div (Geist Mono, fontSize 22)
    // Navigate 3 ancestor levels up from the ticker heading to reach the Card div,
    // then click the first "Open →" within that card.
    const tickerHeading = this.page.locator('[style*="Geist Mono"]').filter({
      hasText: new RegExp(`^${ticker}$`),
    }).first();
    const cardEl = tickerHeading.locator('xpath=ancestor::div[3]');
    await cardEl.getByText('Open →').first().click();
  }
}
