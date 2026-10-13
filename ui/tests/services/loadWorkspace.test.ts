import { describe, expect, it } from 'vitest';

import { FileError, parseJsonTolerant } from '@/services/schemas';
import { loadWorkspace } from '@/services/workspace';

import { fixtureSource, fixtureText, MemorySource, ROUND_2 } from '../helpers/memorySource';

describe('loadWorkspace', () => {
  it('loads the real fixture rounds with their reports and decisions', async () => {
    const ws = await loadWorkspace(fixtureSource());
    expect(ws.rounds.length).toBe(2);
    expect(ws.broken).toEqual([]);
    const r2 = ws.rounds.find((r) => r.id === ROUND_2)!;
    expect(r2.report?.schema_version).toBe(2);
    expect(r2.report?.simulations?.length).toBe(161);
    expect(r2.decisions?.reviewer).toMatch(/scripted/);
    expect(r2.requirementText).toBe(fixtureText(`${ROUND_2}/R0.dsl`));
  });

  it('keeps loading the other rounds when one is broken, naming the file', async () => {
    const source = new MemorySource({
      'good/run_meta.json': fixtureText(`${ROUND_2}/run_meta.json`),
      'bad/run_meta.json': '{not json',
      'noreport/run_meta.json': JSON.stringify({ run_id: 'noreport', status: 'complete' }),
      'notaround/notes.txt': 'x',
    });
    const ws = await loadWorkspace(source);
    expect(ws.rounds.map((r) => r.dir).sort()).toEqual(['good', 'noreport']);
    expect(ws.broken.length).toBe(1);
    expect(ws.broken[0]?.error).toBeInstanceOf(FileError);
    expect(ws.broken[0]?.error.file).toBe('bad/run_meta.json');
    expect(ws.broken[0]?.error.kind).toBe('malformed');
    expect(ws.ignored).toEqual(['notaround']);
    expect(ws.rounds.find((r) => r.dir === 'noreport')?.report).toBeNull();
  });

  it('refuses a report with a newer schema version by name, and reports a malformed one by field', async () => {
    const meta = fixtureText(`${ROUND_2}/run_meta.json`);
    const future = JSON.stringify({
      ...JSON.parse(fixtureText(`${ROUND_2}/analysis_report.json`)),
      schema_version: 9,
    });
    const ws = await loadWorkspace(
      new MemorySource({
        'a/run_meta.json': meta,
        'a/analysis_report.json': future,
        'b/run_meta.json': meta.replace(ROUND_2, 'bbb'),
        'b/analysis_report.json': JSON.stringify({
          run_id: 'bbb',
          analysed_at: 'x',
          requirement: {},
          admissibility: {},
          obstacles: [],
        }),
      }),
    );
    const a = ws.rounds.find((r) => r.dir === 'a')!;
    expect(a.report).toBeNull();
    expect(a.reportError?.kind).toBe('unsupported-version');
    expect(a.reportError?.message).toMatch(/schema version 9/);
    const b = ws.rounds.find((r) => r.dir === 'b')!;
    expect(b.reportError?.kind).toBe('malformed');
    expect(b.reportError?.details.join(' ')).toMatch(/failure_model/);
  });

  it('reads bare NaN tokens from older reports as null, only after a strict parse fails', () => {
    expect(parseJsonTolerant('{"a": NaN, "b": [1, -Infinity], "c": "NaN"}', 'x.json')).toEqual({
      a: null,
      b: [1, null],
      c: 'NaN',
    });
    expect(() => parseJsonTolerant('{"a": }', 'x.json')).toThrow(FileError);
  });
});
