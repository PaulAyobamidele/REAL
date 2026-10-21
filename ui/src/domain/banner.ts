/**
 * A report's banner line (analysis_report.json "banner"): a job still running
 * (PARTIAL ...), a job that ended early (INCOMPLETE ...), or any other note about
 * the round, such as a re-judging. Each gets its own title, so a note is never
 * shown as an incomplete run.
 */
export function bannerKind(banner: string): 'partial' | 'incomplete' | 'note' {
  if (banner.startsWith('PARTIAL')) return 'partial';
  if (banner.startsWith('INCOMPLETE')) return 'incomplete';
  return 'note';
}

export const BANNER_TITLE = {
  partial: 'Results so far',
  incomplete: 'Incomplete run',
  note: 'About this round',
} as const;
