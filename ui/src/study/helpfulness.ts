import type { DecisionsDoc } from '@/services/schemas';

/**
 * The study's question on every diagnosis the tool shows (each obstacle and each
 * set-aside scope item): was it helpful to the participant's decision? It answers
 * the evaluation's "how many diagnoses do engineers report as unhelpful". Stored on
 * the item in decisions.json as `helpful: { rating, why }`; study build only.
 */
export type HelpfulRating = 'helpful' | 'partly' | 'not_helpful';

export interface Helpful {
  rating: HelpfulRating | null;
  why: string | null;
}

export const HELPFUL_OPTIONS: { value: HelpfulRating; label: string }[] = [
  { value: 'helpful', label: 'Helpful' },
  { value: 'partly', label: 'Partly helpful' },
  { value: 'not_helpful', label: 'Not helpful' },
];

type Item = { helpful?: Helpful };

export function helpfulOf(doc: DecisionsDoc, id: string): Helpful {
  const item = (doc.obstacles[id] ?? doc.scope[id]) as Item | undefined;
  return item?.helpful ?? { rating: null, why: null };
}

/** The diagnoses not yet rated: signing in the study waits for every one. */
export function unratedDiagnoses(doc: DecisionsDoc): string[] {
  return [...Object.keys(doc.obstacles), ...Object.keys(doc.scope)].filter(
    (id) => !helpfulOf(doc, id).rating,
  );
}
