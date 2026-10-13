/**
 * Consecutive identical steps folded into one with a count: confidence that
 * flickers across a bar emits the same event again and again, which would
 * bury the story.
 */
export function foldRepeats(sequence: string[][]): { step: string[]; times: number }[] {
  const out: { step: string[]; times: number }[] = [];
  for (const step of sequence) {
    const last = out[out.length - 1];
    if (last && last.step.join('|') === step.join('|')) last.times += 1;
    else out.push({ step, times: 1 });
  }
  return out;
}
