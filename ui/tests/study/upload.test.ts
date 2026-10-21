import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { storagePath, uploadConfigured } from '@/study/upload';
import { zipFiles } from '@/study/zip';

// the file-name rule the storage enforces (docs/study/supabase_setup.sql)
const sql = readFileSync(resolve(__dirname, '../../../docs/study/supabase_setup.sql'), 'utf8');
const rule = new RegExp(sql.match(/name ~ '([^']+)'/)![1]!);

describe('sending a session to the online storage', () => {
  it('names each zip so the storage accepts it, one per signing', () => {
    const path = storagePath('S-FT2R', new Date('2026-10-20T10:10:08.664Z'));
    expect(path).toBe('S-FT2R/study_S-FT2R_20261020T101008.zip');
    expect(rule.test(path)).toBe(true);
  });

  it('never sends anything under test', () => {
    expect(uploadConfigured).toBe(false);
  });

  it('zips binary files too (the admin page bundles the session zips)', () => {
    const inner = zipFiles({ 'a/x.txt': 'hello' });
    const outer = zipFiles({ 'sessions/a.zip': inner });
    expect(outer.length).toBeGreaterThan(inner.length);
    expect(String.fromCharCode(...outer.slice(0, 2))).toBe('PK');
  });
});
