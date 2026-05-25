import { type Page } from '@playwright/test';

export class StoryPage {
  constructor(private page: Page) {}

  async getTicker(): Promise<string> {
    // Wait for StoryView to render — the back button is unique to StoryView (not visible on Hub).
    // Without this wait, a Hub ticker (e.g. RKLB) is found before navigation completes.
    await this.page.getByRole('button', { name: '← Hub' }).waitFor();
    // The ticker in the top nav bar is a Geist Mono div with only 2–5 uppercase letters.
    const tickerEl = this.page.locator('[style*="Geist Mono"]').filter({
      hasText: /^[A-Z]{2,5}$/,
    }).first();
    await tickerEl.waitFor();
    return (await tickerEl.textContent())?.trim() ?? '';
  }

  async getVerdictLabel(): Promise<string> {
    // Pill component renders as a <span> with borderRadius: 999 (→ border-radius: 999px in DOM).
    // The verdict pill is the first such span in the document (in the top nav bar).
    const pill = this.page.locator('span[style*="border-radius: 999px"]').first();
    await pill.waitFor();
    return (await pill.textContent())?.trim() ?? '';
  }

  async clickBack(): Promise<void> {
    await this.page.getByRole('button', { name: '← Hub' }).click();
  }

  async openSearch(): Promise<void> {
    // The "Find in report" button has a data-find-btn attribute
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
      // Navigate into the stage header: first child div → last child div → first child div
      const headerRow = stageEl.locator('> div').first();
      const labelContainer = headerRow.locator('> div').last();
      const labelEl = labelContainer.locator('> div').first();
      const text = await labelEl.textContent();
      headings.push(text?.trim() ?? '');
    }
    return headings;
  }

  async clickStageRail(stageNum: '01' | '02' | '03' | '04' | '05'): Promise<void> {
    // Stage rail buttons contain the step number in an inner div.
    // Filter: find a button whose child div has text exactly matching the stage number.
    const railBtn = this.page.locator('button').filter({
      has: this.page.locator('div').filter({ hasText: new RegExp(`^${stageNum}$`) }),
    }).first();
    await railBtn.click();
    // Wait for smooth scroll animation to settle
    await this.page.waitForTimeout(400);
  }
}
