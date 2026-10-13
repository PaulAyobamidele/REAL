import type { Obstacle } from '@/services/schemas';

/**
 * Support order for obstacles, shared by every screen that lists them: the
 * tool's verdict first (supported, then insufficient data, then not
 * supported), then the strength of the evidence (share of the failures or
 * passes for a behaviour or outcome obstacle, effect for a setting
 * obstacle), then the id. Only the supported ones are above the bar; the
 * rest are kept, folded into one line that expands.
 */
const VERDICT_RANK: Record<string, number> = {
  supported: 0,
  insufficient_data: 1,
  not_supported: 2,
};

export function isSupported(o: Obstacle): boolean {
  return o.verdict === 'supported';
}

/** How strongly the evidence backs the obstacle, for ordering only; -Infinity when absent. */
export function supportStrength(o: Obstacle): number {
  const ev = o.evidence as Record<string, unknown> | null;
  const value = ev ? (ev.share ?? ev.effect) : null;
  return typeof value === 'number' && Number.isFinite(value) ? value : -Infinity;
}

export function bySupport(a: Obstacle, b: Obstacle): number {
  return (
    (VERDICT_RANK[a.verdict] ?? 9) - (VERDICT_RANK[b.verdict] ?? 9) ||
    supportStrength(b) - supportStrength(a) ||
    a.id.localeCompare(b.id)
  );
}

export function belowBarWords(obstacles: Obstacle[]): string {
  const counts = new Map<string, number>();
  for (const o of obstacles) counts.set(o.verdict, (counts.get(o.verdict) ?? 0) + 1);
  const parts = [
    counts.get('insufficient_data') ? `${counts.get('insufficient_data')} insufficient data` : null,
    counts.get('not_supported') ? `${counts.get('not_supported')} not supported` : null,
  ].filter(Boolean);
  return `${obstacles.length} obstacle${obstacles.length === 1 ? '' : 's'} below the support bar${parts.length ? ` (${parts.join(', ')})` : ''}`;
}
