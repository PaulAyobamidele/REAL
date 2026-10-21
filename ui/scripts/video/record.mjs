#!/usr/bin/env node
/**
 * Records the screen shots of the demo videos (docs/video/icse_video.md),
 * one clip per shot, 1920x1080, by driving the tool the same way every take.
 *
 *   node scripts/video/record.mjs            # every shot
 *   node scripts/video/record.mjs S4 S5      # some
 *
 * Needs, running:
 *   the normal tool on round C1   VITE_PUBLIC_DIR=study-public npx vite --port 5175
 *   the study build                VITE_STUDY=1 npx vite --port 5174
 *   the authoring helper           sim_env/bin/python -m scripts.redsl.serve   (S3)
 * The scenes' image name and links come from VIDEO_IMAGE, VIDEO_REPO and
 * VIDEO_PAPER (kept out of the repository's files).
 * Writes artifacts/video/<date>/<shot>.webm and, per shot, a few check
 * frames (<shot>_<n>.png). Uses the installed Chrome (no browser download).
 * Never submits a run: S3 stops at the run panel's first step.
 */
/* global localStorage, location, document, addEventListener, requestAnimationFrame, scrollTo, sessionStorage -- INIT and the evaluate() callbacks run in the page */
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const UI = resolve(HERE, '..', '..');
const REPO = resolve(UI, '..');
const TOOL = 'http://localhost:5175';
// the page at 125% (1536x864 CSS px, drawn at 1.25x), recorded at 1920x1080: larger, still sharp
const SIZE = { width: 1536, height: 864 };
// the recorder captures the page at its CSS size: recorded at the viewport's own size (a larger
// size only pads it with grey), then scaled to 1920x1080 by to_mp4.py
const VIDEO = SIZE;
const DAY = new Date().toISOString().slice(0, 10);
const OUT = join(REPO, 'artifacts', 'video', DAY);
const RUN = 'fbf8bbcfe2d759778e6ba73d9bd43412'; // round C1, under its neutral id

/** A cursor the viewer can see (recordings have none), with a ripple on click; tours off. */
const INIT = ({ expertise }) => {
  for (const build of ['tool', 'study'])
    for (const p of [
      'welcome',
      'overview',
      'author',
      'manual',
      'example',
      'step1',
      'step2',
      'step3',
      'step4',
      'step5',
      'workspace',
      'lineage',
    ])
      localStorage.setItem(`real.tour.seen.${build}.${p}`, '1');
  if (expertise) localStorage.setItem('real.tool.expertise', expertise);
  const draw = () => {
    // the animated scenes (file://) have no pointer to show
    if (location.protocol === 'file:' || document.getElementById('demo-cursor')) return;
    // scrolled-to parts land below the sticky header, not under it
    const style = document.createElement('style');
    // the researchers' note about a round (e.g. its re-judging) is not for the video
    style.textContent =
      '* { scroll-margin-top: 84px; } [data-round-banner="note"] { display: none !important; }';
    document.head.appendChild(style);
    const c = document.createElement('div');
    c.id = 'demo-cursor';
    c.style.cssText =
      'position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;' +
      'transform:translate(-200px,-200px);transition:transform 60ms linear;';
    c.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 2l7.5 19 2.6-7.7L21 10.5z" ' +
      'fill="#172033" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    addEventListener(
      'mousemove',
      (e) => {
        c.style.transform = `translate(${e.clientX - 3}px, ${e.clientY - 2}px)`;
      },
      true,
    );
    addEventListener(
      'mousedown',
      (e) => {
        const r = document.createElement('div');
        r.style.cssText =
          `position:fixed;left:${e.clientX - 18}px;top:${e.clientY - 18}px;width:36px;height:36px;` +
          'border-radius:50%;border:3px solid #9eb200;z-index:2147483646;pointer-events:none;' +
          'transition:transform 450ms ease-out,opacity 450ms ease-out;transform:scale(.4);opacity:1;';
        document.documentElement.appendChild(r);
        requestAnimationFrame(() => {
          r.style.transform = 'scale(1.6)';
          r.style.opacity = '0';
        });
        setTimeout(() => r.remove(), 500);
      },
      true,
    );
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', draw);
  else draw();
};

class Shot {
  constructor(browser, name, { storageState, expertise = '' } = {}) {
    this.browser = browser;
    this.name = name;
    this.storageState = storageState;
    this.expertise = expertise;
    this.frames = 0;
  }
  async open() {
    this.dir = join(OUT, `.${this.name}`);
    rmSync(this.dir, { recursive: true, force: true });
    this.context = await this.browser.newContext({
      viewport: SIZE,
      deviceScaleFactor: 1.25,
      recordVideo: { dir: this.dir, size: VIDEO },
      acceptDownloads: true,
      ...(this.storageState ? { storageState: this.storageState } : {}),
    });
    await this.context.addInitScript(INIT, { expertise: this.expertise });
    this.page = await this.context.newPage();
    this.mouse = { x: SIZE.width / 2, y: SIZE.height / 2 };
    return this;
  }
  hold(ms) {
    return this.page.waitForTimeout(ms);
  }
  async go(url, wait = 2500) {
    await this.page.goto(url);
    await this.hold(wait);
    await this.page.mouse.move(this.mouse.x, this.mouse.y);
  }
  /** Glide the cursor to an element's centre, as a person would. */
  async to(locator, { dx = 0, dy = 0, steps = 28 } = {}) {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (!box) throw new Error(`${this.name}: nothing to point at`);
    const x = box.x + box.width / 2 + dx;
    const y = box.y + box.height / 2 + dy;
    await this.page.mouse.move(x, y, { steps });
    this.mouse = { x, y };
    await this.hold(250);
  }
  async click(locator, opts) {
    await this.to(locator, opts);
    await this.page.mouse.down();
    await this.hold(90);
    await this.page.mouse.up();
    await this.hold(500);
  }
  /** Scroll so the element sits in the upper part of the screen, smoothly. */
  async scrollTo(locator, block = 'start') {
    await locator.evaluate((el, b) => el.scrollIntoView({ behavior: 'smooth', block: b }), block);
    await this.hold(1100);
  }
  async check() {
    await this.page.screenshot({ path: join(OUT, `${this.name}_${++this.frames}.png`) });
  }
  async close() {
    const video = this.page.video();
    await this.context.close();
    const path = await video.path();
    renameSync(path, join(OUT, `${this.name}.webm`));
    rmSync(this.dir, { recursive: true, force: true });
  }
}

const card = (page, id) => page.locator(`article[aria-labelledby="obstacle-${id}"]`);

/** Shots, in the order of docs/video/icse_video.md. */
const SHOTS = {
  async S2(b) {
    const s = await new Shot(b, 'S2').open();
    await s.go(`${TOOL}/#/welcome`, 2000);
    await s.check();
    await s.hold(1200);
    await s.click(s.page.getByLabel('Your expertise'));
    await s.page.keyboard.type('Robotic Requirement Engineering', { delay: 70 });
    await s.hold(700);
    await s.to(s.page.getByRole('button', { name: 'Get started →' }));
    await s.check();
    await s.hold(800);
    await s.click(s.page.getByRole('button', { name: 'Get started →' }));
    await s.hold(1500);
    await s.close();
  },

  async S3(b) {
    const s = await new Shot(b, 'S3', { expertise: 'Robotic Requirement Engineering' }).open();
    await s.go(`${TOOL}/#/author`, 3500);
    const editor = s.page.getByLabel('Requirement text');
    const r0 = await requirementText(s.page);
    // the requirement up to the first module, typed in through completion
    const cut = r0.indexOf('performed by "') + 'performed by "'.length;
    const end = r0.indexOf('"', cut);
    await s.click(editor);
    await s.page.keyboard.insertText(r0.slice(0, cut));
    await s.hold(900);
    await s.page.keyboard.press('Control+Space');
    await s.hold(1600);
    await s.check();
    await s.page.keyboard.type(r0.slice(cut, end).slice(0, 4), { delay: 140 });
    await s.hold(700);
    await s.page.keyboard.press('Enter');
    await s.hold(500);
    await s.page.keyboard.insertText(r0.slice(end)); // from the closing quote on
    await s.hold(2200);
    // pointing at an assumption marks its box in the goal model
    await s.to(s.page.locator('.cm-content').getByText('fog_density', { exact: false }).first());
    await s.hold(1800);
    await s.check();
    await s.to(s.page.locator('.cm-content').getByText('yolov5s', { exact: false }).first());
    await s.hold(1500);
    // the way on; the panel opens at its first step - never submitted
    const start = s.page.getByRole('button', { name: /Start Running Compliance Test/ });
    await s.click(start);
    await s.hold(2500);
    await s.check();
    await s.close();
  },

  async S4(b) {
    const s = await new Shot(b, 'S4').open();
    await s.go(`${TOOL}/#/review/${RUN}/2`, 3500);
    await s.page.evaluate(() => scrollTo(0, 0));
    await s.hold(1200);
    await s.scrollTo(s.page.getByRole('region', { name: 'Summary' }), 'center');
    await s.to(s.page.getByRole('region', { name: 'Summary' }).getByText('Failed'));
    await s.hold(1800);
    await s.check();
    await s.scrollTo(s.page.getByRole('heading', { name: 'What failed in the requirement' }));
    await s.hold(800);
    await s.to(s.page.getByRole('button', { name: /^broken assumption: fog_density/ }));
    await s.hold(2500);
    await s.check();
    await s.to(s.page.getByRole('button', { name: /^failed safety goal/ }));
    await s.hold(2000);
    await s.close();
  },

  async S5(b) {
    const s = await new Shot(b, 'S5').open();
    await s.go(`${TOOL}/#/review/${RUN}/example`, 3500);
    await s.scrollTo(s.page.getByRole('region', { name: 'The best scenario' }));
    await s.hold(800);
    const video = s.page.locator('video').first();
    await s.click(video);
    await video.evaluate((v) => v.play());
    await s.hold(4500);
    await s.check();
    await s.click(s.page.getByRole('button', { name: 'Play the replay' }));
    await s.hold(5200);
    await s.check();
    await s.click(s.page.getByRole('button', { name: /Closest/ }));
    await s.hold(2500);
    await s.check();
    await s.close();
  },

  async S6(b) {
    const s = await new Shot(b, 'S6').open();
    await s.go(`${TOOL}/#/review/${RUN}/3`, 3500);
    await s.page.evaluate(() => scrollTo(0, 0));
    await s.scrollTo(s.page.getByRole('region', { name: 'Requirement as a goal model' }));
    await s.hold(1200);
    await s.click(s.page.getByRole('button', { name: 'DetectionTooLate', exact: true }).first());
    await s.hold(2200);
    await s.check();
    await s.scrollTo(s.page.getByRole('region', { name: 'Failures, video, evidence' }));
    await s.hold(1800);
    await s.scrollTo(s.page.locator('section[aria-labelledby="patterns-title"]'));
    await s.hold(2800);
    await s.check();
    await s.close();
  },

  async S7(b) {
    const s = await new Shot(b, 'S7').open();
    await s.go(`${TOOL}/#/review/${RUN}/4`, 3500);
    // small pedestrians are inside the world the car must handle (the parent paper counts
    // them as real violations), so they go to the car; nothing scopes them away
    const below = s.page.locator('summary', { hasText: /support bar/ });
    await s.scrollTo(below, 'center');
    await s.click(below);
    const size = card(s.page, 'PedestrianSizeTooSmall');
    await s.scrollTo(size);
    await s.hold(1500);
    await s.click(size.getByText('The car is at fault'));
    await s.hold(2200);
    await s.check();
    // the firm rule: an assumption about the car is refused, with its reason
    const late = card(s.page, 'DetectionTooLate');
    await s.scrollTo(late);
    await s.to(late.getByText('The world explains these failures, not the car'));
    await s.hold(3200);
    await s.check();
    await s.click(late.getByText('The car is at fault'));
    await s.hold(1500);
    await s.close();
  },

  async S8(b) {
    // the triage first, off camera: every obstacle the car's (no world choice scopes
    // failures away), the scope items' verdicts confirmed
    const setup = await b.newContext({ viewport: SIZE, deviceScaleFactor: 1.25 });
    await setup.addInitScript(INIT, { expertise: 'Robotic Requirement Engineering' });
    const p = await setup.newPage();
    await p.goto(`${TOOL}/#/review/${RUN}/4`);
    await p.waitForTimeout(3500);
    const ids = await p
      .locator('article[aria-labelledby^="obstacle-"]')
      .evaluateAll((els) =>
        els.map((e) => e.getAttribute('aria-labelledby').slice('obstacle-'.length)),
      );
    const more = p.locator('summary', { hasText: /below/ });
    if (await more.count()) await more.first().click();
    for (const id of ids) {
      await card(p, id).getByText('The car is at fault').click();
    }
    // the scope items' pre-filled verdicts: confirmed one by one (the list shrinks)
    const confirms = await p.getByRole('button', { name: /Confirm as my verdict/ }).count();
    for (let i = 0; i < confirms; i++)
      await p
        .getByRole('button', { name: /Confirm as my verdict/ })
        .first()
        .click();
    await p.waitForTimeout(800);
    // drafts live in sessionStorage: carried over into the recording page below
    const draft = await p.evaluate(() =>
      Object.entries(sessionStorage).filter(([k]) => k.includes('draft')),
    );
    if (!draft.some(([, v]) => v.includes('"explained_by":"car"')))
      throw new Error('S8: the off-camera triage did not save its choices');
    await setup.close();

    const s = await new Shot(b, 'S8', { expertise: 'Robotic Requirement Engineering' }).open();
    await s.context.addInitScript((entries) => {
      for (const [k, v] of entries) if (!sessionStorage.getItem(k)) sessionStorage.setItem(k, v);
    }, draft);
    await s.go(`${TOOL}/#/review/${RUN}/5`, 3500);
    await s.page.evaluate(() => scrollTo(0, 0));
    await s.scrollTo(s.page.getByRole('region', { name: 'Refined requirement' }));
    await s.hold(1800);
    // the car: a real system failure, fixed with a larger detector
    const late = s.page.getByRole('article', { name: 'Remaining: DetectionTooLate' });
    await s.scrollTo(late, 'center');
    await s.click(late.getByText('It is a real system failure'));
    await s.hold(900);
    await s.click(late.getByRole('radio', { name: /^model:/ }).first());
    await s.hold(1800);
    await s.check();
    // the promise: the requirement asked the wrong thing, refined in the reviewer's words
    const PROMISE = 'Remaining: StandoffUnnecessaryStop';
    const standoff = s.page.getByRole('article', { name: PROMISE });
    if (await standoff.count()) {
      await s.scrollTo(standoff, 'center');
      await s.click(standoff.getByText('Refine the requirement'));
      await s.hold(900);
      const use = standoff.getByRole('button', { name: 'Use this' });
      if (await use.count()) await s.click(use);
      else {
        await s.click(standoff.getByRole('textbox'));
        await s.page.keyboard.type('The car must resume within 10 s once the crossing is clear.', {
          delay: 35,
        });
      }
      await s.hold(2200);
      await s.check();
    }
    for (const r of await s.page.locator('article[aria-label^="Remaining: "]').all()) {
      const name = await r.getAttribute('aria-label');
      if (name === 'Remaining: DetectionTooLate' || name === PROMISE) continue;
      await s.click(r.getByText('Not enough evidence: leave it for the next round'));
    }
    await s.scrollTo(s.page.getByRole('region', { name: 'Sign' }));
    await s.click(s.page.getByLabel(/Reviewer \(your name\)/));
    await s.page.keyboard.type('A. Reviewer', { delay: 60 });
    await s.hold(600);
    await s.to(s.page.getByRole('button', { name: /^Sign:/ }));
    await s.hold(1200);
    await s.check();
    await s.close();
  },

  async S9(b) {
    // the normal tool's welcome page (the expertise is recorded with each signed review)
    const s = await new Shot(b, 'S9').open();
    await s.go(`${TOOL}/#/welcome`, 2500);
    await s.hold(1500);
    await s.click(s.page.getByLabel('Your expertise'));
    await s.page.keyboard.type('Legal Compliance', { delay: 70 });
    await s.hold(1500);
    await s.check();
    await s.close();
  },

  async S10(b) {
    const s = await new Shot(b, 'S10').open();
    await s.go(`file://${join(HERE, 'scenes', 'terminal.html')}?${SCENE_QUERY}`, 7500);
    await s.check();
    await s.go(`${TOOL}/#/manual`, 2500);
    await s.scrollTo(s.page.locator('#manual-keywords'));
    await s.hold(1500);
    await s.scrollTo(s.page.locator('#manual-examples'));
    await s.hold(1800);
    await s.check();
    await s.close();
  },
};

/** The animations: each scene page plays once; recorded for its length.
 * P0-P7 are the opening slides (docs/video/slides.md), each point fading in on its cue. */
const SCENES = {
  P0: 6000,
  P1: 15000,
  P2: 17000,
  P3: 20000,
  P4: 14000,
  P5: 21000,
  P6: 16000,
  P7: 7000,
  A1: 9000,
  A2: 13000,
  A3: 14000,
  E1: 7000,
};

/** What the scenes show that must not live in the repository's files: passed in at recording time. */
const SCENE_QUERY = new URLSearchParams({
  image: process.env.VIDEO_IMAGE ?? '',
  repo: process.env.VIDEO_REPO ?? '',
  paper: process.env.VIDEO_PAPER ?? '',
}).toString();

async function scene(b, name, ms) {
  const s = await new Shot(b, name).open();
  await s.go(`file://${join(HERE, 'scenes', `${name}.html`)}?${SCENE_QUERY}`, 300);
  await s.page.mouse.move(-50, -50);
  // a check frame every few seconds, to review the animation without playing it
  for (let t = 0; t < ms; t += 3500) {
    await s.hold(Math.min(3500, ms - t));
    await s.check();
  }
  await s.close();
}

async function requirementText(page) {
  const meta = await page.evaluate(async (run) => {
    const r = await fetch(`./workspace/${run}/run_meta.json`);
    return r.json();
  }, RUN);
  return meta.requirement;
}

async function main() {
  const wanted = process.argv.slice(2);
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    for (const [name, record] of Object.entries(SHOTS))
      if (!wanted.length || wanted.includes(name)) {
        process.stdout.write(`${name} … `);
        await record(browser);
        console.log('done');
      }
    for (const [name, ms] of Object.entries(SCENES))
      if (
        (!wanted.length || wanted.includes(name)) &&
        existsSync(join(HERE, 'scenes', `${name}.html`))
      ) {
        process.stdout.write(`${name} … `);
        await scene(browser, name, ms);
        console.log('done');
      }
    // S1: CARLA's own recording of test case 6, as it is
    const carla = join(UI, 'study-public', 'workspace', RUN, 'videos', '6.mp4');
    if ((!wanted.length || wanted.includes('S1')) && existsSync(carla))
      copyFileSync(carla, join(OUT, 'S1.mp4'));
  } finally {
    await browser.close();
  }
  console.log(
    `clips in ${OUT}:`,
    readdirSync(OUT)
      .filter((f) => !f.startsWith('.'))
      .join(', '),
  );
}

await main();
