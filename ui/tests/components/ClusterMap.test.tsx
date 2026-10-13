import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ClusterMapView } from '@/components/evidence/ClusterMap';
import { foldRepeats } from '@/domain/sequences';
import { clusterMapSchema, parseWithSchema, type ClusterMap } from '@/services/schemas';

const step = (...events: string[]) => events;
const STALL = [
  step('closing to 20-10 m'),
  step('braking begins'),
  step('ego stops'),
  step('closest approach'),
];
const RELEASE = [
  step('closing to 20-10 m'),
  step('braking begins'),
  step('braking released while moving'),
  step('safety violated (<5 m)'),
  step('closest approach'),
];

function group(cluster: number, size: number, failed: number, sequence: string[][], sid: string) {
  return {
    cluster,
    size,
    medoid: { scenario_id: sid, sim_index: 0 },
    medoid_sequence: sequence,
    outcomes: failed ? { brake_released: failed } : { passed_stalled: size },
    failed,
    scenarios: [sid],
    within_median: 0.1,
    over_represented_settings: failed
      ? [{ setting: 'direction', value: 'LR', in_cluster: 1, overall: 0.5 }]
      : [],
  };
}

const doc: ClusterMap = parseWithSchema(
  JSON.stringify({
    schema_version: 1,
    parameters: { run_id: 'x' },
    map: { method: 'mds', variance_2d: 0.4, rank_correlation: 0.9 },
    points: [
      {
        scenario_id: '1',
        sim_index: 0,
        x: 0,
        y: 0,
        failure_type: 'passed_stalled',
        failed: false,
        sequence: STALL,
      },
      {
        scenario_id: '1',
        sim_index: 1,
        x: 0.1,
        y: 0,
        failure_type: 'passed_stalled',
        failed: false,
        sequence: STALL,
      },
      {
        scenario_id: '2',
        sim_index: 0,
        x: 1,
        y: 1,
        failure_type: 'brake_released',
        failed: true,
        sequence: RELEASE,
      },
      {
        scenario_id: '2',
        sim_index: 1,
        x: 1,
        y: 1,
        failure_type: 'brake_released',
        failed: true,
        sequence: RELEASE,
      },
    ],
    default_cut: 0,
    cuts: [
      {
        linkage: 'average',
        threshold: 0.5,
        clusters: 2,
        silhouette: 0.8,
        structure: 'strong structure',
        assignment: [1, 1, 2, 2],
        groups: [group(1, 2, 0, STALL, '1'), group(2, 2, 2, RELEASE, '2')],
      },
      {
        linkage: 'average',
        threshold: 0.1,
        clusters: 3,
        silhouette: 0.4,
        structure: 'weak structure - clusters may be artificial',
        assignment: [1, 3, 2, 2],
        groups: [
          group(1, 1, 0, STALL, '1'),
          group(2, 2, 2, RELEASE, '2'),
          group(3, 1, 0, STALL, '1'),
        ],
      },
    ],
  }),
  clusterMapSchema,
  'cluster_map.json',
);

describe('ClusterMapView: every encounter on one map, clusters as cards', () => {
  it('draws one mark per encounter and a card per cluster with its typical run', () => {
    const { container } = render(
      <ClusterMapView
        doc={doc}
        rows={[]}
        highlight={null}
        selectedKey={null}
        onSelect={() => {}}
      />,
    );
    expect(container.querySelectorAll('svg[role="img"] > g')).toHaveLength(4);
    const card = screen.getByRole('article', { name: 'Cluster 2' });
    expect(within(card).getByText(/2 runs · 2 failed/)).toBeInTheDocument();
    expect(within(card).getByText('safety violated (<5 m)')).toBeInTheDocument();
    expect(within(card).getByText(/direction LR: 100% vs 50%/)).toBeInTheDocument();
    expect(screen.getByText(/strong structure/)).toBeInTheDocument();
    expect(screen.getByText(/keeps 90% of the distance ranking/)).toBeInTheDocument();
  });

  it('moves to a finer cut with the slider and says when structure is weak', () => {
    render(
      <ClusterMapView
        doc={doc}
        rows={[]}
        highlight={null}
        selectedKey={null}
        onSelect={() => {}}
      />,
    );
    fireEvent.change(screen.getByRole('slider'), { target: { value: '1' } });
    expect(screen.getByText(/weak structure/)).toBeInTheDocument();
    expect(screen.getByText(/2 single-run clusters/)).toBeInTheDocument();
  });

  it('counts the ringed runs per cluster and opens the typical run', () => {
    const onSelect = vi.fn();
    render(
      <ClusterMapView
        doc={doc}
        rows={[]}
        highlight={new Set(['2_0', '2_1'])}
        highlightLabel="the 2 runs behind BrakingNotLatched"
        selectedKey={null}
        onSelect={onSelect}
      />,
    );
    expect(
      within(screen.getByRole('article', { name: 'Cluster 2' })).getByText('2 of the ringed'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('article', { name: 'Cluster 1' })).getByText('0 of the ringed'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Open the typical run \(2\/0\)/ }));
    expect(onSelect).toHaveBeenCalledWith('2_0');
  });
});

describe('foldRepeats', () => {
  it('folds consecutive identical steps into one with a count', () => {
    const seq = [step('a'), step('b'), step('b'), step('b'), step('a', 'c'), step('b')];
    expect(foldRepeats(seq)).toEqual([
      { step: ['a'], times: 1 },
      { step: ['b'], times: 3 },
      { step: ['a', 'c'], times: 1 },
      { step: ['b'], times: 1 },
    ]);
  });
});
