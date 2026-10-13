import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fromCheck, normaliseDsl, toDsl } from '@/domain/requirementForm';
import {
  authoringCatalogSchema,
  checkResultSchema,
  type AuthoringCatalog,
  type CheckResult,
} from '@/services/authoring';

/**
 * The requirement form round-trips through the project's own parser: every
 * docs/examples/*.dsl is read by Python (scripts/redsl/serve.check), put in
 * the form, rendered back to DSL, and the rendering is read by Python again.
 * The text must be unchanged apart from whitespace and comments, and the two
 * goal trees must be equal. Skipped when no interpreter with the project's
 * packages is found.
 */
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const EXAMPLES = join(REPO_ROOT, 'docs', 'examples');

function findPython(): string | null {
  for (const candidate of [
    process.env.REAL_PYTHON,
    join(REPO_ROOT, 'sim_env', 'bin', 'python'),
    'python3',
  ]) {
    if (!candidate || (candidate.includes('/') && !existsSync(candidate))) continue;
    try {
      execFileSync(candidate, ['-c', 'import scripts.redsl.serve'], {
        cwd: REPO_ROOT,
        stdio: 'ignore',
      });
      return candidate;
    } catch {
      // try the next one
    }
  }
  return null;
}

const python = findPython();
const describeIf = python ? describe : describe.skip;

function py(code: string, input: unknown): unknown {
  const out = execFileSync(python as string, ['-c', code], {
    cwd: REPO_ROOT,
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, PYTHONPATH: REPO_ROOT },
  });
  return JSON.parse(out);
}

const CHECK_ALL =
  'import sys, json; from scripts.redsl import serve; ' +
  'texts = json.load(sys.stdin); print(json.dumps([serve.check(t) for t in texts]))';

describeIf('the requirement form round-trips through the project parser', () => {
  const files = existsSync(EXAMPLES) ? readdirSync(EXAMPLES).filter((f) => f.endsWith('.dsl')) : [];
  const catalog: AuthoringCatalog = authoringCatalogSchema.parse(
    py('import json; from scripts.redsl import serve; print(json.dumps(serve.catalog()))', null),
  );
  const originals = files.map((f) => readFileSync(join(EXAMPLES, f), 'utf8'));
  const checks = (py(CHECK_ALL, originals) as unknown[]).map((c) => checkResultSchema.parse(c));

  it('finds the examples', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  files.forEach((file, i) => {
    it(`${file}: dsl -> form -> dsl is unchanged apart from whitespace and comments`, () => {
      const check = checks[i] as CheckResult;
      expect(check.ok).toBe(true);
      if (!check.ok) return;
      const back = fromCheck(check, catalog);
      expect('form' in back ? null : back.reason).toBeNull();
      if (!('form' in back)) return;
      const rendered = toDsl(back.form);
      expect(normaliseDsl(rendered)).toBe(normaliseDsl(originals[i]!));

      const again = checkResultSchema.parse((py(CHECK_ALL, [rendered]) as unknown[])[0]);
      expect(again.ok).toBe(true);
      if (again.ok) expect(again.tree).toEqual(check.tree);
    });
  });

  it('the catalog never offers an assumption about the car', () => {
    expect(catalog.assumption_quantities.some((q) => q.name.startsWith('ego'))).toBe(false);
  });
});
