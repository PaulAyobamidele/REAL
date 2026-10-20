import { describe, expect, it } from 'vitest';

import { analysisReportSchema, parseWithSchema } from '@/services/schemas';
import { prepareSigning } from '@/services/signing';
import { createDraft } from '@/state/draft';

import { fixtureText, ROUND_2 } from '../helpers/memorySource';

const report = parseWithSchema(
  fixtureText(`${ROUND_2}/analysis_report.json`),
  analysisReportSchema,
  'analysis_report.json',
);
const R0 = (JSON.parse(fixtureText(`${ROUND_2}/run_meta.json`)) as { requirement: string })
  .requirement;

describe('signing records the reviewer’s expertise', () => {
  it('writes reviewer_expertise next to the reviewer, and nothing when none was given', () => {
    const { doc } = createDraft(report, null, null, 2);
    // decide everything so the document validates: every obstacle deferred, every scope item in scope
    for (const o of Object.values(doc.obstacles)) o.verdict = 'defer';
    for (const s of Object.values(doc.scope)) s.verdict = 'in_scope';
    const signed = prepareSigning({
      doc,
      report,
      r0: R0,
      reviewer: 'A Reviewer',
      r1Override: null,
      expertise: ' Legal Compliance ',
    });
    expect(signed.doc).toMatchObject({
      reviewer: 'A Reviewer',
      reviewer_expertise: 'Legal Compliance',
    });
    const plain = prepareSigning({ doc, report, r0: R0, reviewer: 'A Reviewer', r1Override: null });
    expect('reviewer_expertise' in plain.doc).toBe(false);
  });
});
