import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { GoalTree } from '@/components/requirement/GoalTree';
import { buildGoalModel } from '@/domain/goalModel';
import { analysisReportSchema, parseWithSchema } from '@/services/schemas';
import { createDraft } from '@/state/draft';

import { fixtureText, ROUND_2 } from '../helpers/memorySource';

const report = parseWithSchema(
  fixtureText(`${ROUND_2}/analysis_report.json`),
  analysisReportSchema,
  'report',
);
const model = buildGoalModel(report);
const draft = createDraft(report, null, null, 2);

describe('GoalTree is a keyboard-navigable ARIA tree', () => {
  it('exposes tree items with levels and marks obstacles as a distinct node type', () => {
    render(
      <GoalTree
        model={model}
        selectedObstacleId={null}
        onSelectObstacle={() => {}}
        draft={draft}
        hasPrevious={false}
      />,
    );
    const tree = screen.getByRole('tree', { name: /goal model/ });
    expect(tree).toBeInTheDocument();
    const items = screen.getAllByRole('treeitem');
    expect(items[0]).toHaveAttribute('aria-level', '1');
    expect(items[0]).toHaveTextContent('Pedestrian Safety');
    const supported = report.obstacles.filter((o) => o.verdict === 'supported');
    expect(screen.getAllByText('obstacle')).toHaveLength(supported.length);
    expect(screen.getByText(/tool: supported/)).toBeInTheDocument();
    expect(screen.getAllByText(/none stated/)).toHaveLength(2);
    expect(screen.getByTitle(/no soft goal named/)).toHaveTextContent(/Unattached/);
  });

  it('puts supported obstacles first and folds the rest into a line that expands', async () => {
    render(
      <GoalTree
        model={model}
        selectedObstacleId={null}
        onSelectObstacle={() => {}}
        draft={draft}
        hasPrevious={false}
      />,
    );
    const folds = screen
      .getAllByRole('treeitem')
      .filter((el) => /below the support bar/.test(el.textContent ?? ''));
    expect(folds.length).toBeGreaterThan(0);
    for (const fold of folds) {
      expect(fold).toHaveAttribute('aria-expanded', 'false');
      await userEvent.click(fold);
      expect(fold).toHaveAttribute('aria-expanded', 'true');
    }
    // everything stays: once open, every obstacle is there
    expect(screen.getAllByText('obstacle')).toHaveLength(report.obstacles.length);
  });

  it('opens the fold that holds an obstacle selected from elsewhere', () => {
    const folded = report.obstacles.find((o) => o.verdict !== 'supported')!;
    render(
      <GoalTree
        model={model}
        selectedObstacleId={folded.id}
        onSelectObstacle={() => {}}
        draft={draft}
        hasPrevious={false}
      />,
    );
    expect(
      screen.getAllByRole('treeitem').some((el) => el.getAttribute('aria-selected') === 'true'),
    ).toBe(true);
  });

  it('moves focus with the arrow keys, collapses with ArrowLeft and selects with Enter', async () => {
    const onSelect = vi.fn();
    render(
      <GoalTree
        model={model}
        selectedObstacleId={null}
        onSelectObstacle={onSelect}
        draft={draft}
        hasPrevious={false}
      />,
    );
    const items = screen.getAllByRole('treeitem');
    const first = items[0]!;
    first.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(items[1]);
    await userEvent.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(first);
    expect(first).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{ArrowLeft}');
    expect(first).toHaveAttribute('aria-expanded', 'false');
    await userEvent.keyboard('{ArrowRight}');
    expect(first).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{End}');
    const last = document.activeElement as HTMLElement;
    expect(last).toHaveTextContent('StandoffUnnecessaryStop');
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('StandoffUnnecessaryStop');
  });

  it('marks the selected obstacle', () => {
    render(
      <GoalTree
        model={model}
        selectedObstacleId="DetectionTooLate"
        onSelectObstacle={() => {}}
        draft={draft}
        hasPrevious={false}
      />,
    );
    const selected = screen
      .getAllByRole('treeitem')
      .filter((el) => el.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent('DetectionTooLate');
  });
});
