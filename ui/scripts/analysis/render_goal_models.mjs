/*
 * Draws the study's goal models (goal_models.json, from
 * scripts/analysis/study_goal_models.py) with the tool's own layout and saves
 * one PNG per figure: combined.png and <participant>.png.
 *
 *   npx vite --port 5176 --strictPort &      (in ui/: serves analysis.html)
 *   node scripts/analysis/render_goal_models.mjs <goal_models.json> <out folder>
 */
/* global window -- the page script below runs in the browser */
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright';

const [input, out] = process.argv.slice(2);
const URL = process.env.ANALYSIS_URL ?? 'http://localhost:5176/analysis.html';
const data = JSON.parse(readFileSync(input, 'utf8'));
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({
    viewport: { width: 1500, height: 1000 },
    deviceScaleFactor: 2,
  });
  await page.addInitScript((d) => {
    window.__GOAL_MODELS__ = d;
  }, data);
  await page.goto(URL);
  await page.waitForSelector('[data-figure]');
  await page.waitForTimeout(800);
  for (const fig of await page.locator('[data-figure]').all()) {
    const id = await fig.getAttribute('data-figure');
    await fig.screenshot({ path: join(out, `${id}.png`) });
    console.log(`${id}.png`);
  }
} finally {
  await browser.close();
}
