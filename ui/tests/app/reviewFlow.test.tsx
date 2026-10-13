import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { App } from '@/App';
import { decisionsSchema, parseWithSchema } from '@/services/schemas';
import { clearDraft } from '@/state/draft';

import { fixtureSource, fixtureText, ROUND_2 } from '../helpers/memorySource';

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

  it('walks every step, keeps the draft across navigation, and signs the same files the CLI writes', async () => {
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

    // the sidebar and the footer both hold Back / Next; only one is displayed at a time in a browser
    // step 2: raw counts, previous column, no obstacle names
    await user.click(screen.getAllByRole('button', { name: /Next/ })[0]!);
    await screen.findByRole('heading', { name: '2. Test Execution Result' });
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
    await user.click(screen.getAllByRole('button', { name: /Next/ })[0]!);
    await screen.findByRole('heading', { name: '3. Failure Analysis' });
    const tree = await screen.findByRole('tree');
    const standoff = within(tree)
      .getAllByRole('treeitem')
      .find((el) => el.textContent?.includes('StandoffUnnecessaryStop'))!;
    await user.click(standoff);
    await screen.findByRole('heading', { name: 'Evidence: StandoffUnnecessaryStop' });
    await waitFor(() => expect(screen.getByText(/113 highlighted/)).toBeInTheDocument(), {
      timeout: 10_000,
    });
    expect(screen.getByText(/requirement layer/)).toBeInTheDocument();

    // step 4: the tool's proposal is pre-filled, not confirmed
    await user.click(screen.getAllByRole('button', { name: /Next/ })[0]!);
    await screen.findByRole('heading', { name: '4. Obstacle triage' });
    expect(screen.getByText(/Pre-filled verdicts/)).toBeInTheDocument();
    let confirms = screen.getAllByRole('button', { name: /Confirm as my verdict/ });
    expect(confirms).toHaveLength(9);
    for (const _ of confirms) {
      // the list shrinks as each one is confirmed
      await user.click(screen.getAllByRole('button', { name: /Confirm as my verdict/ })[0]!);
    }
    expect(screen.queryByRole('button', { name: /Confirm as my verdict/ })).not.toBeInTheDocument();
    const childCard = screen.getByRole('article', { name: 'PedestrianSizeTooSmall' });
    const reason = within(childCard).getByLabelText('Reason, in your own words');
    await user.clear(reason);
    await user.type(reason, 'My own words.');

    // back to step 3 and forward again: the draft survives
    await user.click(screen.getAllByRole('button', { name: /Back/ })[0]!);
    await screen.findByRole('heading', { name: '3. Failure Analysis' });
    await user.click(screen.getAllByRole('button', { name: /Next/ })[0]!);
    await screen.findByRole('heading', { name: '4. Obstacle triage' });
    expect(screen.queryByRole('button', { name: /Confirm as my verdict/ })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('article', { name: 'PedestrianSizeTooSmall' })).getByLabelText(
        'Reason, in your own words',
      ),
    ).toHaveValue('My own words.');
    confirms = [];

    // step 5: changes, side by side, sign
    await user.click(screen.getAllByRole('button', { name: /Next/ })[0]!);
    await screen.findByRole('heading', { name: '5. Requirement revision' });
    expect(
      screen.getByText('ensuring "vehicle resumes within 10 s once the crossing is clear"'),
    ).toBeInTheDocument();
    const sign = screen.getByRole('button', { name: /^Sign:/ });
    expect(sign).toBeDisabled();
    await user.type(screen.getByLabelText(/Reviewer \(your name\)/), 'Test Reviewer');
    expect(sign).toBeEnabled();
    await user.click(sign);
    await screen.findAllByText(/Signed by Test Reviewer/); // the success notice, and the existing-file notice after the reload

    // the written files
    const written = source.writes;
    expect([...written.keys()].sort()).toEqual([
      `${ROUND_2}/R0.dsl`,
      `${ROUND_2}/R1.dsl`,
      `${ROUND_2}/decisions.json`,
      `${ROUND_2}/requirement_diff.md`,
    ]);
    expect(written.get(`${ROUND_2}/R1.dsl`)).toBe(fixtureText(`${ROUND_2}/R1.dsl`));
    expect(written.get(`${ROUND_2}/requirement_diff.md`)).toBe(
      fixtureText(`${ROUND_2}/requirement_diff.md`),
    );
    const text = written.get(`${ROUND_2}/decisions.json`)!;
    const doc = parseWithSchema(text, decisionsSchema, 'decisions.json');
    expect(doc.reviewer).toBe('Test Reviewer');
    expect(doc.obstacles.PedestrianSizeTooSmall?.reason).toBe('My own words.');
    expect(doc.proposed_by_tool).toBeUndefined();
    // byte for byte the file the Python tools wrote for the same decisions, up to the reviewer, the date and the one edited reason
    const expected = fixtureText(`${ROUND_2}/decisions.json`)
      .replace(/"reviewer": ".*"/, `"reviewer": "Test Reviewer"`)
      .replace(/"decided_at": ".*"/, `"decided_at": "${doc.decided_at}"`)
      .replace('"reason": "No child effect in the data."', '"reason": "My own words."');
    expect(text).toBe(expected);
  }, 60_000);
});
