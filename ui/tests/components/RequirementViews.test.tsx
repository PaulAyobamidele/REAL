import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { RequirementViewBody, ViewSwitch } from '@/components/requirement/RequirementViews';
import { buildGoalModel } from '@/domain/goalModel';
import { analysisReportSchema, parseWithSchema } from '@/services/schemas';
import { createDraft } from '@/state/draft';
import { useRequirementView, type RequirementView } from '@/state/requirementView';

import { fixtureText, ROUND_2 } from '../helpers/memorySource';

const report = parseWithSchema(
  fixtureText(`${ROUND_2}/analysis_report.json`),
  analysisReportSchema,
  'report',
);
const model = buildGoalModel(report);
const draft = createDraft(report, null, null, 2);
const text = fixtureText(`${ROUND_2}/R0.dsl`);

function Harness() {
  const [view, setView] = useState<RequirementView>('tree');
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <>
      <ViewSwitch view={view} onChange={setView} />
      <output aria-label="selected">{selected ?? 'none'}</output>
      <RequirementViewBody
        view={view}
        text={text}
        model={model}
        report={report}
        draft={draft}
        hasPrevious={false}
        selectedObstacleId={selected}
        onSelectObstacle={setSelected}
        textLabel="requirement text"
      />
    </>
  );
}

// jsdom here has no localStorage; an in-memory one stands in (the hook already copes without)
const memory = new Map<string, string>();
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, v),
    removeItem: (k: string) => void memory.delete(k),
    clear: () => memory.clear(),
  },
});

beforeEach(() => window.localStorage.clear());

describe('three views of one requirement', () => {
  it('switches between text, tree and diagram', () => {
    render(<Harness />);
    expect(screen.getByRole('tree')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Text' }));
    expect(screen.getByLabelText('requirement text')).toHaveTextContent(
      'MAINTAIN "Pedestrian Safety"',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Diagram' }));
    expect(screen.getByRole('img', { name: /KAOS goal model/ })).toBeInTheDocument();
  });

  it('draws every obstacle in the diagram, and a click selects it', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Diagram' }));
    const diagram = screen.getByRole('img', { name: /KAOS goal model/ });
    const obstacles = within(diagram).getAllByRole('button', { name: /^Obstacle / });
    expect(obstacles).toHaveLength(report.obstacles.length);
    const first = report.obstacles[0]!;
    fireEvent.click(
      within(diagram).getByRole('button', { name: new RegExp(`^Obstacle ${first.id} `) }),
    );
    expect(screen.getByLabelText('selected')).toHaveTextContent(first.id);
  });

  it('keeps the selection when the view changes', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Diagram' }));
    const target = report.obstacles.find((o) => o.verdict === 'supported') ?? report.obstacles[0]!;
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Obstacle ${target.id} `) }));
    fireEvent.click(screen.getByRole('button', { name: 'Tree' }));
    const selected = screen
      .getAllByRole('treeitem')
      .filter((el) => el.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent(target.id);
  });
});

describe('the chosen view is remembered', () => {
  it('per screen, across a remount', () => {
    const first = renderHook(() => useRequirementView('step3', 'tree'));
    expect(first.result.current[0]).toBe('tree');
    act(() => first.result.current[1]('diagram'));
    first.unmount();
    expect(renderHook(() => useRequirementView('step3', 'tree')).result.current[0]).toBe('diagram');
    expect(renderHook(() => useRequirementView('step1', 'text')).result.current[0]).toBe('text');
  });
});
