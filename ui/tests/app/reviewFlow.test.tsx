import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { App } from '@/App';
import { decisionsSchema, parseWithSchema } from '@/services/schemas';
import { clearDraft } from '@/state/draft';

import { fixtureSource, ROUND_2 } from '../helpers/memorySource';

const REPO = join(__dirname, '..', '..', '..');
const PYTHON = join(REPO, 'sim_env', 'bin', 'python');

/**
 * The one flow that must work in full: load a workspace, open a round, walk
 * the five steps, enter verdicts, sign, and check the written files - on the
 * real round-2 data, against the files the Python tools wrote for the same
 * decisions.
 */
async function goTo(hash: string) {
  await act(async () => {
    window.location.hash = hash;
  });
}

describe('the five-step review on the real round 2', () => {
  beforeEach(() => {
    clearDraft(ROUND_2);
    window.location.hash = '#/';
  });

  it('walks every step, keeps the draft across navigation, and signs an R1 the Python tools derive identically', async () => {
    const source = fixtureSource(true);
    render(<App autoOpenExample={false} initialSource={source} />);
    const user = userEvent.setup();

    // workspace screen names every file read
    await screen.findAllByText('fixture workspace', {}, { timeout: 10_000 });
    expect(screen.getAllByText('analysis_report.json').length).toBeGreaterThan(0);

    // lineage: two rounds, same requirement version, state words
    await goTo('#/lineage');
    await screen.findByRole('heading', { name: 'Rounds' });
    expect(screen.getAllByText('A')).toHaveLength(2);
    expect(screen.getByText('tool proposal on file, awaiting signature')).toBeInTheDocument();
    expect(screen.getByText('analysed, awaiting signature')).toBeInTheDocument();

    // step 1
    await goTo(`#/review/${ROUND_2}/1`);
    await screen.findByRole('heading', { name: '1. The requirement under test' });
    expect(screen.getAllByText('none stated')).toHaveLength(2);
    expect(screen.getByLabelText('The requirement this round was run with')).toHaveTextContent(
      'MAINTAIN "Pedestrian Safety"',
    );
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();

    // the way on is "See <next step> →", centred under each step; after step 1, the worked example
    await user.click(screen.getByRole('link', { name: 'See Example: the best scenario →' }));
    await screen.findByRole('heading', { name: 'Example: the best scenario' });
    // step 2: raw counts, previous column, no obstacle names
    await user.click(screen.getByRole('link', { name: 'See Test Execution Report →' }));
    await screen.findByRole('heading', { name: '2. Test Execution Report' });
    // the summary: test cases, runs, passed, failed; then every count beside the previous round's
    const summary = screen.getByRole('region', { name: 'Summary' });
    expect(within(summary).getByText('Test cases').nextElementSibling).toHaveTextContent('32');
    expect(within(summary).getByText('Runs').nextElementSibling).toHaveTextContent('160');
    expect(
      screen.getByRole('heading', { name: 'What failed in the requirement' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '160' })).toHaveLength(3); // runs, this round and the previous one
    expect(screen.getByRole('link', { name: '113' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '120' })).toBeInTheDocument(); // the previous round's encounters
    expect(screen.queryByText(/StandoffUnnecessaryStop/)).not.toBeInTheDocument();

    // step 3: the goal model, an obstacle's evidence
    await user.click(screen.getAllByRole('link', { name: /^See .* →$/ })[0]!);
    await screen.findByRole('heading', { name: '3. Failure Analysis' });
    // it opens on the diagram; the tree is one switch away
    expect(screen.getByRole('button', { name: 'Diagram' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Tree' }));
    const tree = await screen.findByRole('tree');
    const standoff = within(tree)
      .getAllByRole('treeitem')
      .find((el) => el.textContent?.includes('StandoffUnnecessaryStop'))!;
    await user.click(standoff);
    await screen.findByRole('heading', { name: 'Evidence: StandoffUnnecessaryStop' });
    await waitFor(() => expect(screen.getByText(/113 highlighted/)).toBeInTheDocument(), {
      timeout: 10_000,
    });
    // the fixes are chosen in the triage, not listed here
    expect(screen.queryByRole('region', { name: 'Fixes' })).toBeNull();

    // step 4: the tool's proposal is pre-filled, then decided world or car
    await user.click(screen.getAllByRole('link', { name: /^See .* →$/ })[0]!);
    await screen.findByRole('heading', { name: '4. Obstacle triage' });
    expect(screen.getByText(/Pre-filled decisions/)).toBeInTheDocument();
    const card = (id: string) => screen.getByRole('article', { name: id });
    // the child obstacle: the tool proposes no assumption (it would scope children out);
    // an engineer who says the world explains it writes the assumption, which goes into R1
    await user.click(
      within(card('PedestrianSizeTooSmall')).getByText(
        'The world explains these failures, not the car',
      ),
    );
    await user.type(
      within(card('PedestrianSizeTooSmall')).getByLabelText(
        /The assumption to add to the refined requirement/,
      ),
      'pedestrian is visible before stepping out',
    );
    // the car-side suggestion (ego_speed) cannot be chosen as the world's
    expect(
      within(card('DetectionTooLate')).getByRole('radio', {
        name: /The world explains these failures/,
      }),
    ).toBeDisabled();
    for (const id of [
      'DetectionTooLate',
      'PedestrianClothingNotVisible',
      'AdverseWeather',
      'BrakingNotLatched',
      'StandoffUnnecessaryStop',
    ])
      await user.click(within(card(id)).getByText('The car is at fault'));
    // the scope items are still verdicts to confirm
    for (const _ of screen.queryAllByRole('button', { name: /Confirm as my verdict/ }))
      await user.click(screen.getAllByRole('button', { name: /Confirm as my verdict/ })[0]!);
    const reason = within(card('PedestrianSizeTooSmall')).getByLabelText(
      'Reason, in your own words',
    );
    await user.clear(reason);
    await user.type(reason, 'My own words.');

    // back to step 3 and forward again: the draft survives
    await user.click(screen.getAllByRole('link', { name: /Back/ })[0]!);
    await screen.findByRole('heading', { name: '3. Failure Analysis' });
    await user.click(screen.getAllByRole('link', { name: /^See .* →$/ })[0]!);
    await screen.findByRole('heading', { name: '4. Obstacle triage' });
    expect(
      within(card('PedestrianSizeTooSmall')).getByLabelText('Reason, in your own words'),
    ).toHaveValue('My own words.');

    // step 5: the refined requirement with the world's line, the failures that remain
    await user.click(screen.getAllByRole('link', { name: /^See .* →$/ })[0]!);
    await screen.findByRole('heading', { name: '5. Requirement revision' });
    const refined = screen.getByRole('region', { name: 'Refined requirement' });
    expect(refined).toHaveTextContent('"pedestrian is visible before stepping out"');
    const remaining = (id: string) => screen.getByRole('article', { name: `Remaining: ${id}` });
    // a real system failure, with the analysis's model-layer fix
    await user.click(
      within(remaining('DetectionTooLate')).getByText('It is a real system failure'),
    );
    await user.click(
      within(remaining('DetectionTooLate')).getAllByRole('radio', { name: /^model:/ })[0]!,
    );
    for (const id of [
      'PedestrianClothingNotVisible',
      'AdverseWeather',
      'BrakingNotLatched',
      'StandoffUnnecessaryStop',
    ])
      await user.click(
        within(remaining(id)).getByText('Not enough evidence: leave it for the next round'),
      );
    const sign = screen.getByRole('button', { name: /^Sign:/ });
    expect(sign).toBeDisabled();
    await user.type(screen.getByLabelText(/Reviewer \(your name\)/), 'Test Reviewer');
    expect(sign).toBeEnabled();
    await user.click(sign);
    await screen.findAllByText(/Signed by Test Reviewer/);

    // the written files
    const written = source.writes;
    expect([...written.keys()].sort()).toEqual([
      `${ROUND_2}/R0.dsl`,
      `${ROUND_2}/R1.dsl`,
      `${ROUND_2}/decisions.json`,
      `${ROUND_2}/requirement_diff.md`,
    ]);
    const r1 = written.get(`${ROUND_2}/R1.dsl`)!;
    expect(r1).toContain('"pedestrian is visible before stepping out"');
    expect(r1).toContain('performed by "yolov5m"');
    const text = written.get(`${ROUND_2}/decisions.json`)!;
    const doc = parseWithSchema(text, decisionsSchema, 'decisions.json');
    expect(doc.reviewer).toBe('Test Reviewer');
    expect(doc.proposed_by_tool).toBeUndefined();
    const decided = doc.obstacles as Record<string, Record<string, unknown>>;
    expect(decided.PedestrianSizeTooSmall).toMatchObject({
      verdict: 'accept',
      explained_by: 'world',
      reason: 'My own words.',
    });
    expect(decided.DetectionTooLate).toMatchObject({
      verdict: 'accept',
      explained_by: 'car',
      resolution: 'system',
    });
    expect(decided.AdverseWeather).toMatchObject({ verdict: 'defer', resolution: 'later' });

    // the Python tools derive the same R1 from these decisions, and validate them
    if (existsSync(PYTHON)) {
      const dir = mkdtempSync(join(tmpdir(), 'flow-'));
      writeFileSync(join(dir, 'decisions.json'), text);
      writeFileSync(join(dir, 'R0.dsl'), written.get(`${ROUND_2}/R0.dsl`)!);
      const out = JSON.parse(
        execFileSync(
          PYTHON,
          [
            '-c',
            [
              'import json, sys',
              'from scripts.analysis import decisions, refine',
              'doc = json.load(open(sys.argv[1])); r0 = open(sys.argv[2]).read()',
              'r1 = refine.apply_changes(r0, refine.plan_changes(doc, r0))',
              'print(json.dumps({"r1": r1, "problems": decisions.validate(doc)}))',
            ].join('\n'),
            join(dir, 'decisions.json'),
            join(dir, 'R0.dsl'),
          ],
          { cwd: REPO },
        ).toString(),
      ) as { r1: string; problems: string[] };
      expect(out.problems).toEqual([]);
      expect(r1).toBe(out.r1);
    }
  }, 60_000);
});
