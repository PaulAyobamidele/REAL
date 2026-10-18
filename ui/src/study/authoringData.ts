import type { MatchResult } from '@/services/authoring';

import { StudySource } from './studySource';

/**
 * Write a requirement without the helper: the study build answers the
 * catalog and the check of the requirement under test (R0) from files made
 * at build time by the project's own Python (scripts/make-study-site.mjs,
 * study-public/study-authoring/), and finds matching runs among the rounds this
 * participant has run.
 */
// not ./authoring: the dev and preview servers forward that path to the helper
const BASE = './study-authoring';

async function json<T>(name: string): Promise<T> {
  const response = await fetch(`${BASE}/${name}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${name}: not bundled with this study build`);
  return (await response.json()) as T;
}

export async function studyCatalog(): Promise<unknown> {
  return json('catalog.json');
}

let r0: Promise<{ text: string; result: unknown }> | null = null;
/** The requirement under test and its check result, as the helper answered at build time. */
export function studyR0(): Promise<{ text: string; result: unknown }> {
  r0 ??= json('check-R0.json');
  return r0;
}

const same = (a: string, b: string) => a.trim() === b.trim();

export async function studyCheck(text: string): Promise<unknown> {
  const { text: r0Text, result } = await studyR0();
  if (same(text, r0Text)) return result;
  return {
    ok: false,
    error: {
      message: 'only the requirement under test can be checked here',
      line: null,
      column: null,
    },
  };
}

/** The rounds this participant has run whose requirement is exactly this text. */
export async function studyMatch(text: string): Promise<MatchResult> {
  const source = await StudySource.probe();
  if (!source) return { ok: true, searched: 0, matches: [] };
  const shown = new Set((await source.list()).rounds.map((r) => r.dir));
  const bundled = (await source.bundled()).filter((r) => shown.has(r.dir));
  const matches = [];
  for (const r of bundled) {
    if (!r.requirement || !same(r.requirement, text)) continue;
    const meta = JSON.parse(await source.readText(`${r.dir}/run_meta.json`)) as {
      created_at?: string;
      mode?: string;
      status?: string;
    };
    matches.push({
      run_id: r.dir,
      mode: meta.mode ?? null,
      created_at: meta.created_at ?? null,
      status: meta.status ?? null,
      analysed: true,
    });
  }
  return { ok: true, searched: shown.size, matches };
}
