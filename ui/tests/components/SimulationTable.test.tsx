import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SimulationTable } from '@/components/evidence/SimulationTable';
import { joinRows, selectEvidence, reportedCounts } from '@/domain/evidence';
import { parseSimulationsCsv } from '@/services/csv';
import { analysisReportSchema, parseWithSchema } from '@/services/schemas';

import { fixtureText, ROUND_2 } from '../helpers/memorySource';

const report = parseWithSchema(
  fixtureText(`${ROUND_2}/analysis_report.json`),
  analysisReportSchema,
  'report',
);
const rows = joinRows(
  parseSimulationsCsv(fixtureText(`${ROUND_2}/simulations.csv`), 'simulations.csv'),
  report.simulations,
);

// jsdom reports no media-query match, so the table renders as cards; the grouping is what matters here.
describe('SimulationTable keeps set-aside simulations visible and uncounted', () => {
  it('lists the set-aside rows in their own group with the reason', () => {
    render(
      <SimulationTable
        rows={rows}
        selection={null}
        filter="all"
        onFilterChange={() => {}}
        selectedKey={null}
        onSelectRow={() => {}}
        worstPhenotype={null}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('128 counted, 33 set aside');
    expect(screen.getByRole('heading', { name: /Set aside — 33 not counted/ })).toBeInTheDocument();
    expect(screen.getAllByText(/Set aside: no encounter/)).toHaveLength(32);
    expect(screen.getByText(/Set aside: recording pass/)).toBeInTheDocument();
  });

  it('filters to the set-aside group alone', () => {
    render(
      <SimulationTable
        rows={rows}
        selection={null}
        filter="set_aside"
        onFilterChange={() => {}}
        selectedKey={null}
        onSelectRow={() => {}}
        worstPhenotype={null}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('0 counted, 33 set aside');
  });

  it('shows an obstacle’s selection and warns when the rows disagree with the report', () => {
    const standoff = report.obstacles.find((o) => o.id === 'StandoffUnnecessaryStop')!;
    const selection = selectEvidence(standoff, rows);
    const { rerender } = render(
      <SimulationTable
        rows={rows}
        selection={selection}
        reported={reportedCounts(standoff)}
        filter="all"
        onFilterChange={() => {}}
        selectedKey={null}
        onSelectRow={() => {}}
        worstPhenotype={null}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('113 highlighted');
    expect(screen.queryByText(/The report counts/)).not.toBeInTheDocument();
    rerender(
      <SimulationTable
        rows={rows}
        selection={selection}
        reported={{ scope: 999, hits: 113 }}
        filter="all"
        onFilterChange={() => {}}
        selectedKey={null}
        onSelectRow={() => {}}
        worstPhenotype={null}
      />,
    );
    const warning = screen.getByText(/The report counts 999 simulations/);
    expect(within(warning.closest('div')!).getByText(/Caution/)).toBeInTheDocument();
  });
});
