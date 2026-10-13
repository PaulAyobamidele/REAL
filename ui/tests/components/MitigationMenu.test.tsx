import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { MitigationMenu } from '@/components/review/MitigationMenu';
import { optionsOf } from '@/domain/decisions';
import { analysisReportSchema, parseWithSchema, type Mitigation } from '@/services/schemas';

import { fixtureText, ROUND_2 } from '../helpers/memorySource';

const report = parseWithSchema(
  fixtureText(`${ROUND_2}/analysis_report.json`),
  analysisReportSchema,
  'report',
);

function Harness({ id, onValue }: { id: string; onValue: (m: Mitigation | null) => void }) {
  const obstacle = report.obstacles.find((o) => o.id === id)!;
  const [value, setValue] = useState<Mitigation | null>(null);
  return (
    <MitigationMenu
      legend="Mitigation"
      obstacleId={id}
      obstacle={obstacle}
      options={optionsOf(obstacle)}
      value={value}
      onChange={(m) => {
        setValue(m);
        onValue(m);
      }}
      required={false}
    />
  );
}

describe('MitigationMenu: the fix is editable', () => {
  it('rewords a catalogue fix and can reset it', async () => {
    const user = userEvent.setup();
    let last: Mitigation | null = null;
    render(<Harness id="StandoffUnnecessaryStop" onValue={(m) => (last = m)} />);
    const scenario = screen.getByRole('radio', { name: /test scenario layer/ });
    await user.click(scenario);
    const catalogue = (last as Mitigation | null)?.action;
    const box = screen.getByLabelText(/Wording \(editable\)/);
    await user.clear(box);
    await user.type(box, 'start the timer later');
    expect(last).toEqual({ layer: 'scenario', action: 'start the timer later' });
    expect(screen.getByText('edited by you')).toBeInTheDocument();
    expect(screen.getAllByText('start the timer later').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Reset to catalogue' }));
    expect(last).toEqual({ layer: 'scenario', action: catalogue });
  });

  it('writes your own fix on any layer and shows the change it implies', async () => {
    const user = userEvent.setup();
    let last: Mitigation | null = null;
    render(<Harness id="BrakingNotLatched" onValue={(m) => (last = m)} />);
    await user.click(screen.getByRole('radio', { name: /Write your own fix/ }));
    expect(screen.getByText('a fix needs its action')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Layer'), 'data');
    await user.type(screen.getByLabelText(/Your fix/), 'more late-braking cases');
    expect(last).toEqual({ layer: 'data', action: 'more late-braking cases' });
    expect(
      screen.getByText('data-level change with no requirement slot: more late-braking cases'),
    ).toBeInTheDocument();
  });
});
