import { splitClauses } from '@/domain/requirementText';
import type { AnalysisReport } from '@/services/schemas';

/**
 * Re-judging a run against a revised requirement in the study page - the
 * same simulations, the revised assumptions - as scripts/analysis/report.py
 * analyse(run, requirement=R1) does it, for what the Test Execution Report
 * shows. The steps before the assumptions (outcomes, trace measures, the
 * safety rule, test-scope rules) come from the project's own Python at build
 * time (ui/scripts/study_quantities.py); this file ports the rest line by
 * line: admissibility.parse_assumption / assumption_status / check_assumptions
 * / assumption_verdicts, soft_goals.parse_soft_goal / goal_status /
 * check_soft_goals, and failure_model.build_failure_model's counts. A
 * contract test compares it with Python on a real run.
 *
 * Not recomputed: the obstacles, the failure types by parameter and scenario,
 * the timing and the map - the parts of the report the Test Execution Report
 * does not show. The re-judged report says so (`rejudged.partial`).
 */
export type PyValue = number | string | boolean | null;

export interface RunQuantities {
  assumption_quantities: Record<string, { level: string; available: boolean }>;
  soft_goal_quantities: string[];
  min_effect: number;
  min_n: number;
  rows: {
    scenario_id: string;
    sim_index: number | null;
    phenotype: string | null;
    failure_type: string | null;
    encounter: boolean;
    failed: boolean;
    rules_reason: string;
    values: Record<string, PyValue>;
  }[];
}

// admissibility.ASSUMPTION_RE (Python's \w is Unicode-aware; so is \p{L}\p{N}_ with /u)
const ASSUMPTION_RE = /^\s*([\p{L}\p{N}_]+)\s*(<=|>=|==|!=|<|>)\s*(-?[\p{L}\p{N}_.]+)\s*$/u;
const PY_FLOAT = /^[+-]?(?:(?:\d(?:_?\d)*)?\.?\d(?:_?\d)*(?:[eE][+-]?\d(?:_?\d)*)?|\d(?:_?\d)*\.)$/;

/** Python's float(x): a number, or throws as float() would. */
export function pyFloat(x: PyValue): number {
  if (typeof x === 'number') return x;
  if (typeof x === 'boolean') return x ? 1 : 0;
  if (x === null) throw new TypeError('float(None)');
  const s = x.trim();
  const special = /^([+-]?)(inf|infinity|nan)$/i.exec(s);
  if (special)
    return special[2]!.toLowerCase() === 'nan' ? NaN : special[1] === '-' ? -Infinity : Infinity;
  if (!PY_FLOAT.test(s)) throw new TypeError(`float(${JSON.stringify(x)})`);
  return Number(s.replaceAll('_', ''));
}

/** Python's str(x) for the values a run holds. */
function pyStr(x: PyValue): string {
  if (x === null) return 'None';
  if (typeof x === 'boolean') return x ? 'True' : 'False';
  if (typeof x === 'number') {
    if (Number.isNaN(x)) return 'nan';
    if (!Number.isFinite(x)) return x > 0 ? 'inf' : '-inf';
    return Number.isInteger(x) ? `${x}.0` : String(x);
  }
  return x;
}

/** admissibility._coerce */
function coerce(a: PyValue, b: PyValue): [number, number] | [string, string] {
  try {
    return [pyFloat(a), pyFloat(b)];
  } catch {
    return [pyStr(a), pyStr(b)];
  }
}

function compare(op: string, a: number | string, b: number | string): boolean {
  switch (op) {
    case '==':
      return a === b;
    case '!=':
      return a !== b;
    case '<':
      return a < b;
    case '<=':
      return a <= b;
    case '>':
      return a > b;
    default:
      return a >= b;
  }
}

/** admissibility._missing */
function missing(value: PyValue): boolean {
  if (value === null || value === '') return true;
  try {
    return Number.isNaN(pyFloat(value));
  } catch {
    return false;
  }
}

export interface AssumptionItem {
  text: string;
  kind: 'scenario' | 'run' | 'free_text' | 'rejected';
  quantity: string | null;
  op: string | null;
  value: string | null;
  message: string;
}

/** admissibility.parse_assumption */
export function parseAssumption(raw: string, q: RunQuantities): AssumptionItem {
  const text = raw.trim();
  const item: AssumptionItem = {
    text,
    kind: 'free_text',
    quantity: null,
    op: null,
    value: null,
    message: '',
  };
  const m = ASSUMPTION_RE.exec(text);
  if (!m) return item;
  const [, quantity, op, value] = m as unknown as [string, string, string, string];
  Object.assign(item, { quantity, op, value });
  const known = q.assumption_quantities;
  if (quantity.startsWith('ego')) {
    item.kind = 'rejected';
    item.message =
      `'${quantity}' is about the car under test. An assumption may only ` +
      'describe the world (pedestrian, weather, road, start positions); ' +
      "otherwise failures could be defined away by narrowing the car's " +
      'own behaviour.';
  } else if (!(quantity in known)) {
    item.kind = 'rejected';
    item.message = `unknown quantity '${quantity}'. Known: ${Object.keys(known).join(', ')}.`;
  } else {
    const spec = known[quantity]!;
    item.kind = spec.level as 'scenario' | 'run';
    if (!spec.available)
      item.message = `'${quantity}' is not recorded yet; this assumption will be reported as not measured.`;
  }
  return item;
}

/** admissibility.assumption_status */
function assumptionStatus(item: AssumptionItem, value: PyValue, q: RunQuantities) {
  if (!q.assumption_quantities[item.quantity!]?.available || missing(value)) return 'not_measured';
  const [a, b] = coerce(value, item.value);
  return compare(item.op!, a, b) ? 'held' : 'broken';
}

/** soft_goals.goal_status */
function goalStatus(item: { op: string; value: string }, value: PyValue) {
  if (value === null || value === '') return 'not_measured';
  try {
    if (Number.isNaN(pyFloat(value))) return 'not_measured';
  } catch {
    return 'not_measured';
  }
  const [a, b] = coerce(value, item.value);
  return compare(item.op, a, b) ? 'met' : 'missed';
}

type Report = AnalysisReport & { rejudged?: unknown };
type Sim = NonNullable<AnalysisReport['simulations']>[number];

const mean = (xs: boolean[]) => (xs.length ? xs.filter(Boolean).length / xs.length : null);

/**
 * The report as the revised requirement judges the same simulations.
 * `r1` is the revised requirement's text (its `assuming` and `ensuring`
 * items are read as report.py reads them).
 */
export function rejudge(report: AnalysisReport, q: RunQuantities, r1: string): Report {
  const { assuming, ensuring } = splitClauses(r1);
  const items = assuming.map((t) => parseAssumption(t, q));
  const checkable = items.filter((i) => i.kind === 'scenario' || i.kind === 'run');

  // check_assumptions: each simulation's status per checkable item; any broken item sets it aside
  const rows = q.rows.map((row) => {
    const statuses = Object.fromEntries(
      checkable.map((i) => [i.text, assumptionStatus(i, row.values[i.quantity!] ?? null, q)]),
    ) as Record<string, string>;
    let reason = row.rules_reason;
    let admissible = !row.rules_reason;
    for (const i of checkable)
      if (statuses[i.text] === 'broken') {
        admissible = false;
        const name = `assumption: ${i.text}`;
        reason = reason ? `${reason}, ${name}` : name;
      }
    return { ...row, statuses, admissible, reason };
  });

  // the summary per item, then assumption_verdicts over real encounters
  const enc = rows.filter((r) => r.encounter);
  const assumptions = items.map((i) => {
    const entry: Record<string, unknown> = {
      text: i.text,
      kind: i.kind,
      quantity: i.quantity,
      message: i.message,
      held: 0,
      broken: 0,
      not_measured: 0,
    };
    if (i.kind !== 'scenario' && i.kind !== 'run') return { ...entry, verdict: null };
    for (const r of rows) entry[r.statuses[i.text]!] = (entry[r.statuses[i.text]!] as number) + 1;
    const held = enc.filter((r) => r.statuses[i.text] === 'held');
    const broken = enc.filter((r) => r.statuses[i.text] === 'broken');
    const rateHeld = mean(held.map((r) => r.failed));
    const rateBroken = mean(broken.map((r) => r.failed));
    let verdict: string;
    if (held.length + broken.length === 0) verdict = 'not measured';
    else if (broken.length === 0) verdict = 'untested';
    else if (held.length < q.min_n || broken.length < q.min_n) verdict = 'insufficient data';
    else if (rateBroken! - rateHeld! >= q.min_effect) verdict = 'load-bearing';
    else if (rateBroken! - rateHeld! <= -q.min_effect) verdict = 'fewer failures when broken';
    else verdict = 'not load-bearing';
    return {
      ...entry,
      enc_held: held.length,
      enc_broken: broken.length,
      rate_held: rateHeld,
      rate_broken: rateBroken,
      verdict,
    };
  });

  // soft goals over the counted encounters (check_soft_goals on the admissible rows)
  const goals = ensuring.map((raw) => {
    const text = raw.trim();
    const m = ASSUMPTION_RE.exec(text);
    if (!m) return { text, kind: 'free_text', quantity: null, op: null, value: null, message: '' };
    const [, quantity, op, value] = m as unknown as [string, string, string, string];
    return q.soft_goal_quantities.includes(quantity)
      ? { text, kind: 'checked', quantity, op, value, message: '' }
      : {
          text,
          kind: 'rejected',
          quantity,
          op,
          value,
          message: `unknown quantity '${quantity}'. Known: ${q.soft_goal_quantities.join(', ')}.`,
        };
  });
  const valid = rows.filter((r) => r.admissible);
  const validEnc = valid.filter((r) => r.encounter);
  const softGoals = goals.map((g) => {
    const entry = {
      text: g.text,
      kind: g.kind,
      quantity: g.quantity,
      message: g.message,
      met: 0,
      missed: 0,
      not_measured: 0,
    };
    if (g.kind === 'checked')
      for (const r of validEnc)
        entry[goalStatus(g as { op: string; value: string }, r.values[g.quantity!] ?? null)] += 1;
    return entry;
  });

  // build_failure_model's counts over the counted simulations
  const fm = report.failure_model;
  const failureModel = {
    ...fm,
    n_simulations: valid.length,
    n_no_encounter: valid.filter((r) => r.failure_type === 'no_encounter').length,
    n_left_road: valid.filter((r) => r.failure_type === 'left_road').length,
    n_not_crossed: valid.filter((r) => r.failure_type === 'not_crossed').length,
    n_encounters: validEnc.length,
    n_scenarios: new Set(valid.map((r) => r.scenario_id)).size,
    failures: validEnc.filter((r) => r.failed).length,
    failure_rate: mean(validEnc.map((r) => r.failed)),
    passes: validEnc.filter((r) => !r.failed).length,
    passed_clean: valid.filter((r) => r.failure_type === 'passed').length,
    passed_stalled: valid.filter((r) => r.failure_type === 'passed_stalled').length,
  };

  // the per-simulation records (report._simulation_records), the recording pass kept as it was
  const checkedGoals = goals.filter((g) => g.kind === 'checked');
  const byKey = new Map(rows.map((r) => [`${r.scenario_id}_${r.sim_index}`, r]));
  const simulations = (report.simulations ?? []).map((s: Sim) => {
    const r = byKey.get(`${s.scenario_id}_${s.sim_index}`);
    if (!r || s.scenario_id === 'best_video') return s;
    const inSummary = r.admissible && r.encounter;
    return {
      ...s,
      admissible: r.admissible,
      set_aside_reason: r.reason,
      assumptions: Object.fromEntries(checkable.map((i) => [i.text, r.statuses[i.text]])),
      soft_goals: inSummary
        ? Object.fromEntries(
            checkedGoals.map((g) => [
              g.text,
              goalStatus(g as { op: string; value: string }, r.values[g.quantity!] ?? null),
            ]),
          )
        : {},
    } as Sim;
  });

  // the spurious summary: grouped by reason, as report.py groups it (pandas sorts the keys)
  const groups = new Map<string, typeof rows>();
  for (const r of rows.filter((x) => !x.admissible))
    groups.set(r.reason, [...(groups.get(r.reason) ?? []), r]);
  const spurious = [...groups.keys()].sort().map((reason) => {
    const sub = groups.get(reason)!;
    return {
      rule: reason,
      n: sub.length,
      failures: sub.filter((r) => r.failed).length,
      scenarios: [...new Set(sub.map((r) => r.phenotype ?? ''))].sort(),
    };
  });

  return {
    ...report,
    requirement: {
      ...report.requirement,
      assumptions: assuming.map((t) => t.trim()),
      soft_goals: ensuring.map((t) => t.trim()),
    },
    admissibility: {
      ...report.admissibility,
      assumptions: assumptions as never,
      free_text_assumptions: items.filter((i) => i.kind === 'free_text').map((i) => i.text),
      n_admissible: valid.length,
      n_spurious: rows.length - valid.length,
      spurious: spurious as never,
    },
    soft_goals: softGoals as never,
    failure_model: failureModel,
    simulations,
    banner: undefined,
    rejudged: {
      requirement: r1,
      partial: ['obstacles', 'failure types by parameter and scenario', 'timing', 'map'],
    },
  };
}
