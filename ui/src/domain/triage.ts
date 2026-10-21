import type { Change, DecisionsDoc, ObstacleDecision, Obstacle } from '@/services/schemas';

import type { StudyMitigation } from '@/study/menu';

/**
 * The study's triage (owner, 2026-10-19): step 4 asks one question per
 * obstacle - does the world explain these failures, or is the car at fault?
 *
 *   world  the obstacle's own requirement change goes into R1 automatically:
 *          its domain assumption (`assuming ...`), or, where the analysis
 *          proposes a soft goal instead, that `ensuring ...` line.
 *          Stored as verdict "accept" with a requirement-layer mitigation.
 *   car    it remains a failure; step 5 resolves it:
 *            refine  the requirement should change (the participant's words)
 *            system  a real system failure, with a car fix
 *            later   not enough evidence: left for the next round (verdict "defer")
 *
 * Everything is stored with the values decisions.py validate() accepts; the
 * two extra fields (`explained_by`, `resolution`) say which path was taken.
 */
export type ExplainedBy = 'world' | 'car';
export type Resolution = 'refine' | 'system' | 'later';

type Entry = ObstacleDecision & {
  explained_by?: ExplainedBy | null;
  resolution?: Resolution | null;
};

export function explainedBy(entry: ObstacleDecision | undefined): ExplainedBy | null {
  return ((entry as Entry | undefined)?.explained_by ?? null) as ExplainedBy | null;
}

export function resolutionOf(entry: ObstacleDecision | undefined): Resolution | null {
  return ((entry as Entry | undefined)?.resolution ?? null) as Resolution | null;
}

/**
 * Obstacles for which the tool proposes no world-side line (owner, 2026-10-21,
 * "option C"): a child is part of the world the car must handle, so the tool
 * does not offer to scope children out; an engineer who still thinks the world
 * explains these failures writes the assumption in their own words.
 * scripts/analysis/refine.py's R_CHANGES has no entry for them either.
 */
export const WORLD_IN_OWN_WORDS = new Set(['PedestrianSizeTooSmall']);

/** What "the world explains it" would add for this obstacle, or why it cannot. */
export interface WorldExplanation {
  /** no proposal: the engineer writes the assumption (WORLD_IN_OWN_WORDS) */
  own: boolean;
  change: Change | null;
  /** the quoted text that goes into R1, e.g. fog_density <= 50 */
  quoted: string | null;
  kind: 'D' | 'R' | null;
  usable: boolean;
  /** the requirement already says it: choosing it adds nothing */
  alreadyIn: boolean;
  /** why it cannot be chosen, in the participant's terms */
  reason: string | null;
}

export function worldExplanation(obstacle: Obstacle | undefined, r0: string): WorldExplanation {
  if (obstacle && WORLD_IN_OWN_WORDS.has(obstacle.id))
    return {
      own: true,
      change: null,
      quoted: null,
      kind: 'D',
      usable: true,
      alreadyIn: false,
      reason: null,
    };
  const change = (obstacle?.changes as Record<string, Change | undefined> | undefined)?.requirement;
  const quoted = change?.text.match(/"([^"]+)"/)?.[1] ?? null;
  const kind = change?.kind === 'D' || change?.kind === 'R' ? change.kind : null;
  if (!change || !kind || !quoted)
    return {
      own: false,
      change: null,
      quoted: null,
      kind: null,
      usable: false,
      alreadyIn: false,
      reason: 'The analysis proposes no assumption or requirement line for this obstacle.',
    };
  // an assumption about the car's own behaviour would define its failures away
  if (kind === 'D' && /^\s*ego[_ ]/i.test(quoted))
    return {
      own: false,
      change,
      quoted,
      kind,
      usable: false,
      alreadyIn: false,
      reason: `Only the car can be at fault here: the analysis’s one world-side idea, ${quoted}, limits the car itself. You can still ask for it in Requirement revision.`,
    };
  return {
    own: false,
    change,
    quoted,
    kind,
    usable: true,
    alreadyIn: r0.includes(`"${quoted}"`),
    reason: null,
  };
}

/**
 * A world-side idea that is really about the car (e.g. ego_speed <= 5),
 * worded as what the requirement could ask of the car - offered in step 5
 * under "Refine the requirement". Null for any other obstacle.
 */
export function carRequest(obstacle: Obstacle | undefined): string | null {
  const change = (obstacle?.changes as Record<string, Change | undefined> | undefined)?.requirement;
  const quoted = change?.kind === 'D' ? change.text.match(/"([^"]+)"/)?.[1] : undefined;
  if (!quoted || !/^\s*ego[_ ]/i.test(quoted)) return null;
  const speed = quoted.match(/^\s*ego_speed(?:_mps)?\s*(<=|<|>=|>)\s*([\d.]+)/i);
  if (speed) {
    const bound = speed[1]!.startsWith('<') ? 'at most' : 'at least';
    return `The car must travel ${bound} ${speed[2]} m/s where a pedestrian may cross.`;
  }
  return `The car must keep ${quoted.trim()}.`;
}

/** The mitigation stored for "the world explains it". */
export function worldMitigation(x: WorldExplanation, own = ''): StudyMitigation | null {
  // the engineer's own assumption: stored as written (refine.change_for: assuming "<action>")
  if (x.own) return { layer: 'requirement', action: own.trim(), choice: 'assumption' };
  if (!x.usable || !x.change) return null;
  return {
    layer: 'requirement',
    action: x.change.text,
    choice: x.kind === 'D' ? 'assumption' : 'requirement',
  };
}

/** The failures that remain: obstacles the participant says the car is at fault for. */
export function remainingFailures(doc: DecisionsDoc): string[] {
  return Object.entries(doc.obstacles)
    .filter(([, o]) => explainedBy(o) === 'car')
    .map(([id]) => id);
}

/** The lines "the world explains it" adds to R1, one per obstacle, none already in R0. */
export function worldChanges(doc: DecisionsDoc, obstacles: Obstacle[], r0: string): Change[] {
  const byId = new Map(obstacles.map((o) => [o.id, o]));
  const out: Change[] = [];
  const seen = new Set<string>();
  for (const [oid, o] of Object.entries(doc.obstacles)) {
    if (explainedBy(o) !== 'world' || o.verdict !== 'accept') continue;
    const x = worldExplanation(byId.get(oid), r0);
    if (x.own) {
      const item = (o.mitigation?.action ?? '').trim();
      const text = `assuming "${item}"`;
      if (!item || r0.includes(`"${item}"`) || seen.has(text)) continue;
      seen.add(text);
      out.push({
        kind: 'D',
        from: oid,
        layer: 'requirement',
        clause: 'assuming',
        item,
        text,
      } as Change);
      continue;
    }
    if (!x.usable || !x.change || x.alreadyIn || seen.has(x.change.text)) continue;
    seen.add(x.change.text);
    out.push({ ...x.change, from: oid });
  }
  return out;
}

/**
 * A saved decision (an older decisions.json, or the tool's proposal) as the
 * triage reads it. Already triaged: as saved. Otherwise, by its verdict:
 *   accepted with the obstacle's own requirement change  -> the world explains it
 *   accepted with a requirement fix in other words       -> the car's; refine
 *   accepted with any other fix                           -> the car's; a system failure
 *   accepted without a fix                                -> the car's, still to resolve
 *   deferred                                              -> the car's; next round
 *   rejected (the old "noise")                            -> undecided
 */
export function triageOfSaved(
  saved: ObstacleDecision,
  obstacle: Obstacle | undefined,
): {
  verdict: ObstacleDecision['verdict'];
  mitigation: ObstacleDecision['mitigation'];
  explained_by: ExplainedBy | null;
  resolution: Resolution | null;
} {
  const by = explainedBy(saved);
  if (by)
    return {
      verdict: saved.verdict,
      mitigation: saved.mitigation,
      explained_by: by,
      resolution: resolutionOf(saved),
    };
  const m = saved.mitigation;
  const accepted = saved.verdict === 'accept' || saved.verdict === 'rename';
  if (accepted && m) {
    const x = worldExplanation(obstacle, '');
    const catalogue = (obstacle?.mitigations as Record<string, string | null> | undefined)
      ?.requirement;
    if (
      m.layer === 'requirement' &&
      x.usable &&
      (m.action === catalogue || m.action === x.change?.text)
    )
      return {
        verdict: 'accept',
        mitigation: worldMitigation(x),
        explained_by: 'world',
        resolution: null,
      };
    return {
      verdict: 'accept',
      mitigation: m,
      explained_by: 'car',
      resolution: m.layer === 'requirement' ? 'refine' : 'system',
    };
  }
  if (accepted) return { verdict: null, mitigation: null, explained_by: 'car', resolution: null };
  if (saved.verdict === 'defer')
    return { verdict: 'defer', mitigation: null, explained_by: 'car', resolution: 'later' };
  return { verdict: null, mitigation: null, explained_by: null, resolution: null };
}
