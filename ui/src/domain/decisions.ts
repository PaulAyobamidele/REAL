import type { AnalysisReport, AssumptionSummary, Obstacle, ToolVerdict } from '@/services/schemas';
import {
  ASSUMPTION_VERDICTS,
  LAYERS,
  OBSTACLE_VERDICTS,
  SCOPE_VERDICTS,
  type AssumptionDecision,
  type DecisionsDoc,
  type Mitigation,
  type ObstacleDecision,
  type ObstacleStatus,
  type ScopeDecision,
} from '@/services/schemas/decisions';

import { pyPercent, pySignedPercent, pyStr } from './pythonFormat';

/**
 * The decision document, built from the analysis exactly as
 * scripts/analysis/decisions.py::from_analysis builds it. Every field the
 * tool can fill is filled; every human field starts null. The `evidence`
 * strings are reproduced character for character because they end up in
 * the shared file.
 */

/** Status of an obstacle relative to the previous round's tool verdict. */
export function obstacleStatus(
  current: ToolVerdict,
  previous: ToolVerdict | null | undefined,
): ObstacleStatus {
  const now = current === 'supported';
  const before = previous === 'supported';
  if (now && before) return 'persisting';
  if (now && !before) return 'new';
  if (before && !now) return 'resolved';
  return 'absent';
}

/** `_evidence_text`: the one-line evidence summary written into decisions.json. */
export function evidenceText(o: Obstacle): string {
  const ev = o.evidence;
  if (!ev) return 'no data';
  if ('passes' in ev) {
    return ev.share !== null && ev.share !== undefined
      ? `${ev.count} of ${ev.passes} passes (${pyPercent(ev.share)})`
      : 'no passes';
  }
  if ('failures' in ev && 'count' in ev) {
    return ev.share !== null && ev.share !== undefined
      ? `${ev.count} of ${ev.failures} failures (${pyPercent(ev.share)})`
      : 'no failures';
  }
  if ('failure_rate' in ev) {
    return (
      `failure rate ${pyPercent(ev.failure_rate)} with vs ${pyPercent(ev.failure_rate_others)} without ` +
      `(effect ${pySignedPercent(ev.effect)}, n=${ev.n})`
    );
  }
  return 'no data';
}

/** `_options`: the mitigation menu offered, in catalogue order, empty layers skipped. */
export function optionsOf(o: Obstacle): Mitigation[] {
  return Object.entries(o.mitigations ?? {})
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([layer, action]) => ({ layer, action }));
}

/** `_assumption_evidence`. */
export function assumptionEvidence(a: AssumptionSummary): string {
  if (a.kind === 'free_text') return 'free text - not checked automatically';
  if (a.kind === 'rejected') return `rejected by the tool: ${pyStr(a.message)}`;
  let text = `held ${a.held ?? 0}, broken ${a.broken ?? 0}`;
  if (a.not_measured) text += `, not measured ${a.not_measured}`;
  const rh = a.rate_held ?? null;
  const rb = a.rate_broken ?? null;
  if (rh !== null || rb !== null) {
    const fmt = (x: number | null) => (x === null ? 'n/a' : pyPercent(x));
    text += `; failure rate over encounters held ${fmt(rh)} / broken ${fmt(rb)}`;
  }
  return text;
}

/** A spurious group whose every reason is an `assuming` item: reviewed as an assumption, not as a rule. */
export function assumptionOnly(reason: string): boolean {
  const parts = reason
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every((p) => p.startsWith('assumption: '));
}

export interface BuildOptions {
  previous?: AnalysisReport | null;
  reviewer?: string | null;
  round?: number | null;
}

/** `from_analysis`: the document with the tool's fields filled and the human's null. */
export function buildDecisions(report: AnalysisReport, options: BuildOptions = {}): DecisionsDoc {
  const previous = options.previous ?? null;
  const prev = new Map<string, ToolVerdict>();
  for (const o of previous?.obstacles ?? []) prev.set(o.id, o.verdict);

  const obstacles: Record<string, ObstacleDecision> = {};
  for (const o of report.obstacles) {
    obstacles[o.id] = {
      verdict: null,
      renamed_to: null,
      status: obstacleStatus(o.verdict, prev.get(o.id)),
      tool_verdict: o.verdict,
      evidence: evidenceText(o),
      reason: null,
      mitigation: null,
      options: optionsOf(o),
    };
  }

  const scope: Record<string, ScopeDecision> = {};
  const rulesByName = new Map(report.admissibility.rules.map((r) => [r.name, r]));
  for (const s of report.admissibility.spurious) {
    if (assumptionOnly(s.rule)) continue;
    const rule = rulesByName.get(s.rule);
    scope[`rule:${s.rule}`] = {
      verdict: null,
      kind: 'rule',
      evidence: `${s.n} simulations set aside (${s.failures} failed)`,
      rule: rule
        ? {
            param: rule.param,
            op: rule.op,
            value: rule.value ?? null,
            source: rule.source ?? null,
          }
        : null,
      reason: null,
    };
  }

  const assumptions: Record<string, AssumptionDecision> = {};
  for (const a of report.admissibility.assumptions ?? []) {
    assumptions[a.text] = {
      verdict: null,
      new_text: null,
      tool_verdict: a.verdict ?? null,
      kind: a.kind,
      evidence: assumptionEvidence(a),
      reason: null,
    };
  }

  for (const a of report.scenario_artefacts ?? []) {
    scope[`artefact:${a.id}`] = {
      verdict: null,
      kind: 'artefact',
      evidence: `${a.metric} = ${pyStr(a.value)}`,
      description: a.description,
      suggested_fix: a.fix,
      reason: null,
    };
  }

  return {
    schema_version: 1,
    run_id: report.run_id,
    round: options.round ?? null,
    parent_run_id: previous?.run_id ?? null,
    reviewer: options.reviewer ?? null,
    decided_at: null,
    obstacles,
    scope,
    assumptions,
    added_assumptions: [],
    requirement_changes: [],
  };
}

const ASSUMPTION_RE = /^\s*(\w+)\s*(<=|>=|==|!=|<|>)\s*([\w.]+)\s*$/;

/**
 * An assumption may only describe the world, never the car under test
 * (`admissibility.parse_assumption`: a quantity starting with "ego" is
 * rejected). Free text and unknown quantities are not refused here.
 */
export function aboutTheCar(text: string): boolean {
  const m = ASSUMPTION_RE.exec(text);
  return Boolean(m && m[1]?.startsWith('ego'));
}

/** `validate`: problems with the document (empty = valid). Nulls are allowed; wrong values are not. */
export function validateDecisions(doc: DecisionsDoc): string[] {
  const problems: string[] = [];
  if (doc.schema_version !== 1) problems.push('schema_version must be 1');
  if (!doc.run_id) problems.push('run_id missing');
  for (const [oid, o] of Object.entries(doc.obstacles ?? {})) {
    const v = o.verdict;
    if (v !== null && !OBSTACLE_VERDICTS.includes(v)) {
      problems.push(
        `obstacle ${oid}: verdict ${JSON.stringify(v)} not in ${OBSTACLE_VERDICTS.join(', ')}`,
      );
    }
    if (v === 'rename' && !o.renamed_to) problems.push(`obstacle ${oid}: rename needs renamed_to`);
    const m = o.mitigation;
    if (m !== null) {
      if (!(LAYERS as readonly string[]).includes(m.layer)) {
        problems.push(
          `obstacle ${oid}: mitigation layer ${JSON.stringify(m.layer)} not in ${LAYERS.join(', ')}`,
        );
      }
      if (!m.action) problems.push(`obstacle ${oid}: mitigation needs an action`);
    }
    if ((v === 'reject' || v === 'defer') && m !== null) {
      problems.push(`obstacle ${oid}: a ${v}ed obstacle cannot carry a mitigation`);
    }
  }
  for (const [sid, s] of Object.entries(doc.scope ?? {})) {
    if (s.verdict !== null && !SCOPE_VERDICTS.includes(s.verdict)) {
      problems.push(
        `scope ${sid}: verdict ${JSON.stringify(s.verdict)} not in ${SCOPE_VERDICTS.join(', ')}`,
      );
    }
  }
  for (const [text, a] of Object.entries(doc.assumptions ?? {})) {
    const v = a.verdict;
    if (v !== null && !ASSUMPTION_VERDICTS.includes(v)) {
      problems.push(
        `assumption ${JSON.stringify(text)}: verdict ${JSON.stringify(v)} not in ${ASSUMPTION_VERDICTS.join(', ')}`,
      );
    }
    if ((v === 'tighten' || v === 'loosen') && !a.new_text) {
      problems.push(`assumption ${JSON.stringify(text)}: ${v} needs new_text`);
    }
    if ((v === 'tighten' || v === 'loosen') && a.new_text && aboutTheCar(a.new_text)) {
      problems.push(`assumption ${JSON.stringify(text)}: new_text is about the car under test`);
    }
  }
  (doc.added_assumptions ?? []).forEach((added, i) => {
    const t = (added.text ?? '').trim();
    if (!t) problems.push(`added_assumptions[${i}]: text missing`);
    else if (aboutTheCar(t))
      problems.push(`added_assumptions[${i}]: ${JSON.stringify(t)} is about the car under test`);
  });
  (doc.requirement_changes ?? []).forEach((ch, i) => {
    if (!['S', 'R', 'D', 'T'].includes(ch.kind)) {
      problems.push(`requirement_changes[${i}]: kind ${JSON.stringify(ch.kind)} not in S, R, D, T`);
    }
    if (!ch.text) problems.push(`requirement_changes[${i}]: text missing`);
  });
  return problems;
}

/**
 * `is_complete`: every obstacle, scope item and assumption has a verdict, and
 * an accepted (or renamed) obstacle that is supported and new or persisting
 * has a mitigation. Why only those: a resolved or absent obstacle has nothing
 * to mitigate this round.
 */
export function isComplete(doc: DecisionsDoc): boolean {
  for (const o of Object.values(doc.obstacles)) {
    if (o.verdict === null) return false;
    if (
      (o.verdict === 'accept' || o.verdict === 'rename') &&
      o.tool_verdict === 'supported' &&
      (o.status === 'new' || o.status === 'persisting') &&
      o.mitigation === null
    ) {
      return false;
    }
  }
  if (!Object.values(doc.assumptions ?? {}).every((a) => a.verdict !== null)) return false;
  return Object.values(doc.scope).every((s) => s.verdict !== null);
}

/** What still blocks completion, in words a reviewer can act on. */
export function completionGaps(doc: DecisionsDoc): string[] {
  const gaps: string[] = [];
  const noVerdict = Object.entries(doc.obstacles).filter(([, o]) => o.verdict === null).length;
  if (noVerdict) gaps.push(`${noVerdict} obstacle${noVerdict === 1 ? '' : 's'} without a verdict`);
  const noMitigation = Object.entries(doc.obstacles).filter(
    ([, o]) =>
      (o.verdict === 'accept' || o.verdict === 'rename') &&
      o.tool_verdict === 'supported' &&
      (o.status === 'new' || o.status === 'persisting') &&
      o.mitigation === null,
  );
  if (noMitigation.length) {
    gaps.push(
      `${noMitigation.length} accepted, supported obstacle${noMitigation.length === 1 ? '' : 's'} without a mitigation (${noMitigation.map(([id]) => id).join(', ')})`,
    );
  }
  const scopeOpen = Object.values(doc.scope).filter((s) => s.verdict === null).length;
  if (scopeOpen)
    gaps.push(`${scopeOpen} scope item${scopeOpen === 1 ? '' : 's'} without a verdict`);
  const assumptionsOpen = Object.values(doc.assumptions ?? {}).filter(
    (a) => a.verdict === null,
  ).length;
  if (assumptionsOpen) {
    gaps.push(
      `${assumptionsOpen} domain assumption${assumptionsOpen === 1 ? '' : 's'} without a verdict`,
    );
  }
  return gaps;
}
