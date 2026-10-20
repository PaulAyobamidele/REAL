import './memoryStorage';

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '@/App';
import { completionGaps, isComplete } from '@/domain/decisions';
import type { DecisionsDoc } from '@/services/schemas';
import type * as StudyConfig from '@/study/config';
import { STUDY_MENU } from '@/study/menu';
import { StudyMitigationMenu } from '@/study/StudyMitigationMenu';

import { FIXTURE_WORKSPACE, MemorySource, ROUND_2 } from '../helpers/memorySource';

vi.mock('@/study/config', async (orig) => ({
  ...(await orig<typeof StudyConfig>()),
  STUDY: true,
}));

/** Round 2 of the fixture without its decisions (a study round starts with none). */
function studyRound(): MemorySource {
  const dir = join(FIXTURE_WORKSPACE, ROUND_2);
  const files = new Map<string, string>();
  for (const name of ['run_meta.json', 'analysis_report.json', 'simulations.csv'])
    files.set(`${ROUND_2}/${name}`, readFileSync(join(dir, name), 'utf8'));
  for (const t of readdirSync(join(dir, 'traces')))
    files.set(`${ROUND_2}/traces/${t}`, readFileSync(join(dir, 'traces', t), 'utf8'));
  return new MemorySource(files, 'Test rounds');
}

// what the tool's judgement looks like on screen in the normal build
const VERDICT_WORDS = [
  /\bsupported\b/i,
  /below the (support )?bar/i,
  /load-bearing/i,
  /insufficient data/i,
  /\btool: /i,
  /in order of support/i,
];

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(
    'real-av.study.session',
    JSON.stringify({ id: 'S-7K3Q', expertise: 'Student', started_at: '', build: 'dev' }),
  );
});

describe('the study build hides the tool verdicts', () => {
  it.each([1, 2, 3, 4, 5])('step %i shows no verdict wording', async (step) => {
    window.location.hash = `#/review/${ROUND_2}/${step}`;
    render(<App autoOpenExample={false} initialSource={studyRound()} />);
    await screen.findByRole('heading', { level: 1 });
    await waitFor(() => expect(document.body.textContent?.length).toBeGreaterThan(500));
    const text = document.body.textContent ?? '';
    for (const word of VERDICT_WORDS) {
      const m = text.match(new RegExp(`.{0,80}${word.source}.{0,60}`, 'i'));
      expect(m?.[0] ?? null, String(word)).toBeNull();
    }
  });

  it('keeps the evidence and lists the obstacles A to Z on the decision step', async () => {
    window.location.hash = `#/review/${ROUND_2}/4`;
    render(<App autoOpenExample={false} initialSource={studyRound()} />);
    await screen.findByRole('heading', { name: /^Obstacles/ });
    const names = screen
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent ?? '')
      .filter((t) => /^[A-Z][A-Za-z]+$/.test(t));
    expect(names.length).toBeGreaterThan(1);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(document.body.textContent).toMatch(/\d+ of \d+ (failures|passes)|failure rate/);
  });
});

describe('the study menu', () => {
  it('offers exactly the six choices and records layer, choice and words', () => {
    const onChange = vi.fn();
    render(<StudyMitigationMenu obstacleId="X" value={null} onChange={onChange} />);
    const group = screen.getByRole('radiogroup', { name: 'Mitigation' });
    expect(
      within(group)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(STUDY_MENU.map((m) => `${m.label}${m.hint}`));
    fireEvent.click(within(group).getByRole('radio', { name: /a larger detector/ }));
    expect(onChange).toHaveBeenLastCalledWith({
      layer: 'system',
      action: 'Change the car: a larger detector',
      choice: 'car_larger_detector',
    });
    fireEvent.click(within(group).getByRole('radio', { name: /Change a domain assumption/ }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ layer: 'requirement', choice: 'assumption' }),
    );
    // in the participant's words: nothing counts until written
    fireEvent.click(within(group).getByRole('radio', { name: /Something else/ }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    fireEvent.change(screen.getByLabelText('Something else: what it is about'), {
      target: { value: 'scenario' },
    });
    fireEvent.change(screen.getByLabelText(/Something else, in your words/), {
      target: { value: 'test more children' },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      layer: 'scenario',
      action: 'test more children',
      choice: 'other',
    });
  });

  it('every accepted obstacle needs a fix in the study build, whatever the tool said', () => {
    const doc = {
      obstacles: {
        A: { verdict: 'accept', tool_verdict: 'not_supported', status: 'new', mitigation: null },
        B: { verdict: 'reject', tool_verdict: 'supported', status: 'new', mitigation: null },
      },
      scope: {},
      assumptions: {},
    } as unknown as DecisionsDoc;
    expect(isComplete(doc)).toBe(false);
    expect(completionGaps(doc)).toContain('1 accepted obstacle without a mitigation (A)');
    expect(isComplete(doc, false)).toBe(true); // the normal rule: only supported ones
  });
});

describe('the failure analysis step in the study build', () => {
  it('has no fixes container: the fixes are chosen in the triage', async () => {
    window.location.hash = `#/review/${ROUND_2}/3`;
    render(<App autoOpenExample={false} initialSource={studyRound()} />);
    const row = (await screen.findByText('Obstacles:')).parentElement!;
    fireEvent.click(within(row).getAllByRole('button')[0]!);
    await screen.findByRole('heading', { name: /^Evidence:/ });
    expect(screen.queryByRole('region', { name: 'Fixes' })).toBeNull();
    expect(document.body).not.toHaveTextContent(/Tool suggestions/);
  });

  it('opens on the diagram, offers no tree, and explains every container', async () => {
    window.location.hash = `#/review/${ROUND_2}/3`;
    render(<App autoOpenExample={false} initialSource={studyRound()} />);
    await screen.findByText('Obstacles:');
    const views = screen.getByRole('group', { name: 'Show the requirement as' });
    expect(within(views).getByRole('button', { name: 'Diagram' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(views).queryByRole('button', { name: 'Tree' })).toBeNull();
    const notes = screen.getAllByRole('note', { name: 'Instructions' });
    expect(notes).toHaveLength(3); // goal model, evidence, patterns
  });
});

describe('the obstacle triage in the study build', () => {
  it('explains world or car above the obstacles', async () => {
    window.location.hash = `#/review/${ROUND_2}/4`;
    render(<App autoOpenExample={false} initialSource={studyRound()} />);
    await screen.findByRole('heading', { name: '4. Obstacle triage' });
    const notes = screen.getAllByRole('note', { name: 'Instructions' });
    expect(notes).toHaveLength(3); // obstacles and fixes, scope, assumptions
    expect(notes[0]).toHaveTextContent('the world explains these failures');
    expect(notes[0]).toHaveTextContent('the car is at fault');
  });
});
