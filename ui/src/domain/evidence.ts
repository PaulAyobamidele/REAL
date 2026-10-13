import type { Obstacle, SimulationLabel } from '@/services/schemas';

/**
 * Reaching the simulations behind a number. Rows come from simulations.csv
 * (the measurements) joined with the report's per-simulation labels (how
 * each ended, whether it counts, whether it was set aside and why). Nothing
 * here computes an outcome: a row without a label says so.
 */

/** One row of simulations.csv as text, exactly as the file has it. */
export type CsvRow = Record<string, string>;

export interface SimulationRow {
  key: string; // `${scenario_id}_${sim_index}`
  scenarioId: string;
  simIndex: number | null;
  csv: CsvRow;
  label: SimulationLabel | null;
}

export const OUTCOME_WORDS: Record<string, string> = {
  passed: 'passed, drove on',
  passed_stalled: 'passed, but stopped and never moved again',
  no_encounter: 'no encounter (car never met the pedestrian)',
  left_road: 'car left the road (test defect)',
  not_crossed: 'pedestrian never crossed (test defect)',
  never_detected: 'failed: never detected',
  detected_not_braked: 'failed: detected, never braked',
  detected_too_late: 'failed: detected too late to stop',
  brake_released: 'failed: brake released before the closest point',
  braking_insufficient: 'failed: braked all the way, still moving',
  stopped_too_close: 'failed: stopped inside the safety margin',
};

export const SET_ASIDE_WORDS: Record<string, string> = {
  no_encounter: 'no encounter',
  left_road: 'car left the road',
  not_crossed: 'pedestrian never crossed',
};

export function outcomeWords(outcome: string | null | undefined): string {
  if (!outcome) return 'outcome not in this report';
  return OUTCOME_WORDS[outcome] ?? outcome;
}

export function rowKey(scenarioId: string, simIndex: number | null): string {
  return `${scenarioId}_${simIndex ?? '?'}`;
}

function toInt(text: string | undefined): number | null {
  if (text === undefined || text === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Join the CSV rows with the report's labels by (scenario_id, sim_index). */
export function joinRows(csv: CsvRow[], labels: SimulationLabel[] | undefined): SimulationRow[] {
  const byKey = new Map<string, SimulationLabel>();
  for (const l of labels ?? []) byKey.set(rowKey(l.scenario_id, l.sim_index), l);
  return csv.map((row) => {
    const scenarioId = row.scenario_id ?? '';
    const simIndex = toInt(row.sim_index);
    const key = rowKey(scenarioId, simIndex);
    return { key, scenarioId, simIndex, csv: row, label: byKey.get(key) ?? null };
  });
}

/**
 * Why a row is not among the counted encounters, if it is not: set aside by
 * a scope rule or a broken assumption (with the reason), a no-encounter, a
 * test defect (left the road, never crossed), not simulated, or the video
 * recording pass. Null for a counted encounter.
 */
export function setAsideReason(row: SimulationRow): string | null {
  const l = row.label;
  if (!l) return null;
  if (l.recording_pass) return l.set_aside_reason || 'recording pass (not a sample)';
  if (l.admissible === false) return l.set_aside_reason || 'set aside (reason not recorded)';
  if (!l.encounter && l.outcome) return SET_ASIDE_WORDS[l.outcome] ?? l.outcome;
  return null;
}

export function isCountedEncounter(row: SimulationRow): boolean {
  return Boolean(row.label && row.label.admissible === true && row.label.encounter);
}

/**
 * The rows behind an obstacle's evidence: the slice the tool looked at
 * (`scope`) and, within it, the rows that show the obstacle (`hits`). For a
 * setting obstacle the scope is the counted encounters with that setting
 * and the hits are the failures among them; for a behaviour obstacle the
 * hits are the failures of that type; for an outcome obstacle the passes of
 * that type.
 */
export interface EvidenceSelection {
  scope: SimulationRow[];
  hits: SimulationRow[];
  description: string;
}

export function selectEvidence(obstacle: Obstacle, rows: SimulationRow[]): EvidenceSelection {
  const counted = rows.filter(isCountedEncounter);
  if (obstacle.outcome) {
    // the tool judges a pass-outcome obstacle over the passes, so that is the scope
    const passes = counted.filter((r) => r.label?.failed === false);
    const hits = passes.filter((r) => r.label?.outcome === obstacle.outcome);
    return { scope: passes, hits, description: `passes that ended as "${obstacle.outcome}"` };
  }
  if (obstacle.failure_type) {
    const hits = counted.filter((r) => r.label?.outcome === obstacle.failure_type);
    return {
      scope: counted.filter((r) => r.label?.failed),
      hits,
      description: `failures of type "${obstacle.failure_type}"`,
    };
  }
  if (obstacle.param) {
    const value = String(obstacle.value ?? '');
    const scope = counted.filter((r) => (r.csv[obstacle.param as string] ?? '') === value);
    const hits = scope.filter((r) => r.label?.failed);
    return {
      scope,
      hits,
      description: `encounters with ${obstacle.param} = ${value}; failures highlighted`,
    };
  }
  return { scope: counted, hits: [], description: 'all counted encounters' };
}

/** The number the report carries for this obstacle's selection, to compare with the rows found. */
export function reportedCounts(obstacle: Obstacle): { scope: number | null; hits: number | null } {
  const ev = obstacle.evidence;
  if (!ev) return { scope: null, hits: null };
  if ('passes' in ev) return { scope: ev.passes, hits: ev.count };
  if ('failure_type' in ev) return { scope: ev.failures, hits: ev.count };
  if ('n' in ev) return { scope: ev.n, hits: ev.failures };
  return { scope: null, hits: null };
}

/** Column definitions for the evidence table: header, CSV field, unit. */
export interface EvidenceColumn {
  key: string;
  header: string;
  unit?: string;
  numeric?: boolean;
}

export const SETTING_COLUMNS: EvidenceColumn[] = [
  { key: 'pedestrian', header: 'pedestrian' },
  { key: 'dress', header: 'clothing' },
  { key: 'direction', header: 'direction' },
  { key: 'distance', header: 'distance' },
  { key: 'fog_density', header: 'fog', unit: '%' },
];

export const MEASURE_COLUMNS: EvidenceColumn[] = [
  { key: 'min_distance_m', header: 'closest approach', unit: 'm', numeric: true },
  { key: 'first_detection_distance_m', header: 'first detection', unit: 'm', numeric: true },
  { key: 'first_detection_conf', header: 'detection confidence', numeric: true },
  { key: 'first_brake_distance_m', header: 'first brake', unit: 'm', numeric: true },
  { key: 'ego_speed_at_first_brake', header: 'speed at first brake', unit: 'm/s', numeric: true },
];

/** A CSV number for display: as written, trimmed to 2 decimals; empty stays empty. */
export function formatCsvNumber(text: string | undefined): string {
  if (text === undefined || text === '') return '';
  const n = Number(text);
  if (!Number.isFinite(n)) return text;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
