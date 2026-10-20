import type {
  AnalysisReport,
  Change,
  DecisionsDoc,
  Mitigation,
  Obstacle,
  RequirementChange,
} from '@/services/schemas';

import { carChanges } from '@/study/car';
import { explainedBy, resolutionOf, worldChanges } from '@/domain/triage';
import { STUDY } from '@/study/config';

import { splitClauses } from './requirementText';

/**
 * The list of requirement changes a decision document implies - a port of
 * refine.plan_changes that *selects* changes rather than deriving them: the
 * change each obstacle mitigation implies is read from the analysis report
 * (obstacles[].changes, written by Python from refine.py's tables), and the
 * assumption text an out-of-scope rule turns into is read from the report's
 * rules (as_assumption). Scope and assumption verdicts are mapped here
 * because they carry no table knowledge.
 */

export interface PlanProblem {
  /** The id (obstacle, scope item) whose change could not be determined. */
  from: string;
  message: string;
}

export interface Plan {
  changes: Change[];
  problems: PlanProblem[];
}

/** `scope_change`. */
export function scopeChange(
  sid: string,
  s: DecisionsDoc['scope'][string],
  asAssumption: string | null,
): Change | null {
  const v = s.verdict;
  if (v === 'out_of_scope') {
    // the stated limit; the reason only for documents written before the limit had its own field
    const item = asAssumption ?? s.limit ?? s.reason ?? sid;
    return {
      kind: 'D',
      from: sid,
      layer: 'requirement',
      clause: 'assuming',
      item,
      text: `assuming "${item}"`,
    };
  }
  if (v === 'in_scope') {
    return {
      kind: 'T',
      from: sid,
      layer: 'scope',
      target: 'scripts/analysis/admissibility_rules.json',
      text: `drop the rule behind ${sid}: the scenario is realistic`,
    };
  }
  if (v === 'scenario_defect') {
    return {
      kind: 'T',
      from: sid,
      layer: 'scenario',
      target: 'scripts/scenarios/scratch.temp',
      text: s.suggested_fix || s.reason || 'fix the test scenario',
    };
  }
  return null;
}

/**
 * `assumption_changes`: [D] changes from keep / tighten / loosen / drop and
 * from added assumptions. `r0Assumptions` = the items in the run's own
 * `assuming` clause; a kept assumption not among them was stated after the
 * run and is new to R1.
 */
export function assumptionChanges(doc: DecisionsDoc, r0Assumptions: string[]): Change[] {
  const changes: Change[] = [];
  for (const [text, a] of Object.entries(doc.assumptions ?? {})) {
    const v = a.verdict;
    const inR0 = r0Assumptions.includes(text);
    const sid = `assumption:${text}`;
    const base = {
      kind: 'D' as const,
      from: sid,
      layer: 'requirement',
      clause: 'assuming' as const,
    };
    if (v === 'keep' && !inR0) {
      changes.push({
        ...base,
        item: text,
        text: `assuming "${text}" (kept; stated after the run)`,
      });
    } else if (v === 'tighten' || v === 'loosen') {
      const next = (a.new_text ?? '').trim();
      const noEvidence = v === 'loosen' && a.tool_verdict === 'untested';
      changes.push({
        ...base,
        item: next,
        replaces: inR0 ? text : null,
        no_evidence: noEvidence,
        text: `assuming "${next}" (${v}ed from "${text}")`,
      });
    } else if (v === 'drop' && inR0) {
      changes.push({ ...base, item: text, remove: true, text: `drop assuming "${text}"` });
    }
  }
  for (const added of doc.added_assumptions ?? []) {
    const t = (added.text ?? '').trim();
    if (t) {
      changes.push({
        kind: 'D',
        from: 'added by reviewer',
        layer: 'requirement',
        clause: 'assuming',
        item: t,
        text: `assuming "${t}" (added)`,
      });
    }
  }
  return changes;
}

const S_LAYERS = ['system', 'model', 'data'];

/**
 * The change one chosen mitigation implies, or a problem string. A catalogue
 * mitigation taken as written is selected from the report. An edited or
 * reviewer-written one follows `change_for`: where refine.py's tables have an
 * entry (an [S] swap with a task, an [R] item, or a [D] item that is not the
 * catalogue text) the action text does not matter and the report's change
 * stands; otherwise the change is built from the action, as Python builds it.
 * A layer with no recorded change is taken to have no table entry.
 */
export function mitigationChange(
  oid: string,
  m: Mitigation,
  obstacle: Obstacle | undefined,
  schemaVersion?: number,
): Change | string {
  const recorded = obstacle?.changes?.[m.layer];
  const catalogue = obstacle?.mitigations?.[m.layer] ?? null;
  if (!obstacle?.changes || (!recorded && m.action === catalogue)) {
    return `the change implied by the ${m.layer} mitigation of ${oid} is not in this analysis report (schema version ${schemaVersion ?? 1}); re-run the analysis to derive it`;
  }
  if (recorded) {
    const fromTable =
      (recorded.kind === 'S' && recorded.task) ||
      recorded.kind === 'R' ||
      (recorded.kind === 'D' && recorded.item !== catalogue);
    if (fromTable || m.action === catalogue) return { ...recorded };
  }
  if (S_LAYERS.includes(m.layer)) {
    return {
      kind: 'S',
      from: oid,
      layer: m.layer,
      task: null,
      module: null,
      available: false,
      text: `${m.layer}-level change with no requirement slot: ${m.action}`,
    };
  }
  if (m.layer === 'requirement') {
    return {
      kind: 'D',
      from: oid,
      layer: m.layer,
      clause: 'assuming',
      item: m.action,
      text: `assuming "${m.action}"`,
    };
  }
  if (m.layer === 'scenario') {
    return {
      kind: 'T',
      from: oid,
      layer: m.layer,
      target: 'scripts/scenarios/scratch.temp',
      text: m.action,
    };
  }
  return `${oid}: mitigation layer ${JSON.stringify(m.layer)} implies no change`;
}

/** `plan_changes`, with the obstacle changes taken from the report. */
export function planChanges(doc: DecisionsDoc, report: AnalysisReport, r0: string | null): Plan {
  const changes: Change[] = [];
  const problems: PlanProblem[] = [];
  const obstaclesById = new Map(report.obstacles.map((o) => [o.id, o]));

  if (STUDY) {
    // the study menu (study/menu.ts): the car changes swap modules, adding up to one of the
    // four saved cars; a change in the participant's words is recorded in decisions.json,
    // never written into R1 (R1 is the tool's, so it always parses and can be run)
    changes.push(...carChanges(doc));
  }
  // "the world explains it" (domain/triage.ts), both builds: the obstacle's assumption or
  // soft goal, added automatically (once, and not when the requirement already says it)
  changes.push(...worldChanges(doc, report.obstacles, r0 ?? ''));
  for (const [oid, o] of Object.entries(doc.obstacles)) {
    if ((o.verdict !== 'accept' && o.verdict !== 'rename') || !o.mitigation) continue;
    if (STUDY) continue;
    // added above; and "refine the requirement" records words, the edit is made in R1 by hand
    // (scripts/analysis/refine.py skips it too)
    if (explainedBy(o) === 'world' || resolutionOf(o) === 'refine') continue;
    const change = mitigationChange(
      oid,
      o.mitigation,
      obstaclesById.get(oid),
      report.schema_version ?? undefined,
    );
    if (typeof change === 'string') problems.push({ from: oid, message: change });
    else changes.push(change);
  }

  const rulesByName = new Map(report.admissibility.rules.map((r) => [r.name, r]));
  for (const [sid, s] of Object.entries(doc.scope)) {
    const ruleName = sid.startsWith('rule:') ? sid.slice('rule:'.length) : null;
    const rule = ruleName ? rulesByName.get(ruleName) : undefined;
    // an out-of-scope rule becomes an `assuming` item only through the report's inversion
    if (s.verdict === 'out_of_scope' && s.rule?.param && rule && rule.as_assumption === undefined) {
      problems.push({
        from: sid,
        message: `the assumption text for rule ${ruleName} is not in this analysis report; re-run the analysis`,
      });
    }
    const change = scopeChange(sid, s, rule?.as_assumption ?? null);
    if (change) changes.push(change);
  }

  const r0Assumptions = r0 ? splitClauses(r0).assuming : [];
  changes.push(...assumptionChanges(doc, r0Assumptions));
  return { changes, problems };
}

/** The `requirement_changes` entries refine.refine records in decisions.json. */
export function toRequirementChanges(changes: Change[]): RequirementChange[] {
  return changes.map((c) => ({
    kind: c.kind,
    text: c.text,
    from: c.from,
    layer: c.layer,
    ...(c.available !== undefined ? { available: c.available } : {}),
  }));
}
