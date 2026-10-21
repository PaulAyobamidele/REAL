/*
 * A dry run of the study build as one participant, start to signing: every page,
 * a mix of decisions with reasons, an early sign attempt (must be refused), the
 * CARLA video played, the zip downloaded, the end screen after a reload.
 *   VITE_STUDY=1 npx vite --port 5174 --strictPort &   (in ui/)
 *   [STUDY_URL=<published site>] node scripts/study/dry_run.mjs <output folder>
 */
import { chromium } from 'playwright';
const S = process.argv[2];
// the study site to walk: the local study server, or the published one (STUDY_URL=...)
const STUDY_URL = process.env.STUDY_URL ?? 'http://localhost:5174/';
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const p = await ctx.newPage();
const bad = [];
p.on('response', (r) => r.status() >= 400 && bad.push(`${r.status()} ${r.url()}`));
p.on('pageerror', (e) => bad.push('pageerror: ' + e.message));
p.on('dialog', (d) => {
  bad.push('dialog: ' + d.message());
  d.dismiss();
});
// a page's guided tour opens once, a moment after the page (later on a published site): skip it
const skip = async () => {
  const button = p.getByRole('button', { name: 'Skip tour' });
  await button.waitFor({ timeout: 6000 }).catch(() => undefined);
  if (await button.count()) {
    await button.click();
    await p.waitForTimeout(400);
  }
};
const next = async () => {
  await p
    .getByRole('link', { name: /^See .*→$/ })
    .last()
    .click();
  await skip();
};
const step = (m) => console.log('·', m);

await p.goto(STUDY_URL);
await p.getByLabel('Your expertise').fill('Dry run (requirements engineering)');
await p.getByRole('button', { name: 'Start' }).click();
await skip();
await p.getByRole('link', { name: /Continue to Requirements Compliance/ }).click();
await skip();
await p.getByRole('button', { name: /Start Running Compliance Test/ }).click();
await skip();
await next();
step('example');
const video = p.locator('video').first();
if (await video.count()) {
  await video.scrollIntoViewIfNeeded();
  await video.click();
  await p.waitForTimeout(2500);
  step('video clicked, paused=' + (await video.evaluate((v) => v.paused)));
}
await p.getByRole('button', { name: /Run 2/ }).click();
await p.waitForTimeout(500);
await next();
step('report');
await next();
step('analysis');
await p.getByRole('button', { name: 'DetectionTooLate' }).first().click();
await p.waitForTimeout(500);
await next();
step('triage');

// failure groups
const pick = {
  AdverseWeather: /The world explains/,
  BrakingNotLatched: /The requirement leaves this out/,
  DetectionTooLate: /The car is at fault/,
  PedestrianClothingNotVisible: /The car is at fault/,
  PedestrianSizeTooSmall: /The car is at fault/,
  StandoffUnnecessaryStop: /The car is at fault/,
};
for (const [id, choice] of Object.entries(pick)) {
  const card = p.locator(`article[aria-labelledby="obstacle-${id}"]`);
  if (!(await card.count())) {
    bad.push('no card ' + id);
    continue;
  }
  await card.getByText(choice).first().click();
  await card.locator('textarea').first().fill(`Dry run: reason for ${id}.`);
  // the study's question on each diagnosis: rate it (one "not helpful", with why)
  const rating = id === 'AdverseWeather' ? 'Not helpful' : 'Helpful';
  await card.getByLabel(rating, { exact: true }).check();
  if (rating === 'Not helpful')
    await card.getByLabel(/What was missing or misleading/).fill('Dry run: no data behind it.');
}
// scope items and assumptions: every other fieldset with radios, first option unless said
const sets = p.locator('fieldset', {
  has: p.locator('legend', { hasText: /Scope verdict|Assumption verdict/ }),
});
const n = await sets.count();
step(`scope/assumption items: ${n}`);
const scopeChoice = ['scenario defect', 'out of scope', 'in scope'];
let k = 0;
const limits = [];
for (let i = 0; i < n; i++) {
  const f = sets.nth(i);
  const legend = await f.locator('legend').innerText();
  if (/Scope/.test(legend))
    await f
      .locator('label', { hasText: new RegExp('^' + scopeChoice[k++ % 3]) })
      .first()
      .click();
  else await f.locator('label', { hasText: /^keep/ }).first().click();
  const card = f.locator('xpath=ancestor::article[1]');
  await card.locator('textarea').last().fill(`Dry run: reason ${i}.`);
  if (/Scope/.test(legend)) await card.getByLabel('Partly helpful', { exact: true }).check();
  const limit = card.getByLabel(/The limit to state in the requirement/);
  if (await limit.count()) {
    limits.push(card);
  }
}
// out of scope without its limit: the revision step must not let the session be signed yet
step(`limit fields shown: ${limits.length}`);
await p.waitForTimeout(800);
await p.screenshot({ path: `${S}/dry/10_triage_done.png`, fullPage: true });
await next();
step('revision');

// try to sign before deciding the remaining failures: must be refused
const sign = p.getByRole('button', { name: /Sign and download/ });
const early = await sign.isDisabled();
step('sign disabled before finishing: ' + early);
if (!early) {
  await sign.click();
  await p.waitForTimeout(1000);
  step('after early sign: ' + p.url());
}
await p.screenshot({ path: `${S}/dry/11_revision_before.png`, fullPage: true });

// now state the limits (back on the triage page), then return
if (limits.length) {
  await p
    .getByRole('link', { name: /Obstacle triage/ })
    .first()
    .click();
  await p.waitForTimeout(1200);
  for (const f of await p.getByLabel(/The limit to state in the requirement/).all())
    await f.fill('the pedestrian crosses ahead of the car');
  await p.waitForTimeout(500);
  await next();
}
for (const r of await p.locator('article[aria-label^="Remaining: "]').all()) {
  const name = await r.getAttribute('aria-label');
  if (name === 'Remaining: DetectionTooLate') {
    await r.getByText('It is a real system failure').click();
    await p.waitForTimeout(400);
    const fix = r.getByRole('radio');
    const opts = await fix.count();
    step('fix options shown: ' + opts);
    await r
      .getByRole('radio')
      .nth(opts - 3 >= 0 ? 3 : opts - 1)
      .check()
      .catch(() => {});
  } else if (name === 'Remaining: StandoffUnnecessaryStop') {
    await r.getByText('Refine the requirement').click();
    await p.waitForTimeout(300);
    await r
      .getByRole('textbox')
      .fill('The car must resume within 10 s once the crossing is clear.');
  } else await r.getByText('Not enough evidence: leave it for the next round').click();
}
await p.waitForTimeout(800);
await p.screenshot({ path: `${S}/dry/12_revision_done.png`, fullPage: true });
step('sign disabled now: ' + (await sign.isDisabled()));
const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), sign.click()]);
await dl.saveAs(`${S}/dry/${dl.suggestedFilename()}`);
step('downloaded ' + dl.suggestedFilename());
// with online storage: the end screen reports the session sent (or why not)
const sent = await p
  .getByText(/has been sent to the research team|could not be sent/)
  .first()
  .waitFor({ timeout: 20000 })
  .then(async () => (await p.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 260))
  .catch(() => 'no sending status shown (online storage not set up for this build)');
step('sending: ' + sent);
await p.waitForTimeout(1500);
step('end url ' + p.url());
await p.screenshot({ path: `${S}/dry/13_end.png` });
// reload: the end screen must survive, with the zip offered again
await p.reload();
await p.waitForTimeout(1500);
step('after reload: ' + (await p.locator('body').innerText()).slice(0, 200).replace(/\s+/g, ' '));
console.log('bad', bad);
await b.close();
