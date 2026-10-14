import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { Loading } from '@/components/feedback';
import { KaosDiagram } from '@/components/requirement/KaosDiagram';
import { MatchingRuns } from '@/components/requirement/MatchingRuns';
import { RunDialog } from '@/components/requirement/RunDialog';
import { TemplateEditor } from '@/components/requirement/TemplateEditor';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Disclosure';
import { Notice } from '@/components/ui/Notice';
import { FileName } from '@/components/ui/Section';
import { buildGoalModel } from '@/domain/goalModel';
import { layoutKaos, type KaosLayout } from '@/domain/kaosLayout';
import {
  emptyForm,
  formProblems,
  fromCheck,
  toDsl,
  type RequirementForm,
} from '@/domain/requirementForm';
import {
  checkRequirement,
  fetchCatalog,
  HELPER_COMMAND,
  HelperUnavailableError,
  modelSourceFromCheck,
  type AuthoringCatalog,
  type CheckResult,
  type ClassifiedItem,
} from '@/services/authoring';
import { downloadText } from '@/services/signing';
import { useRunTest } from '@/state/runTest';
import { useWorkspace } from '@/state/WorkspaceContext';
import { cx } from '@/utils/format';

/**
 * Write a requirement the way one writes LaTeX in Overleaf: the source on
 * the left, the picture on the right, redrawn as you type. The source is the
 * DSL itself with its gaps to fill - the fixed words are text, free gaps
 * take suggestions from the project's example requirements, bounded gaps
 * are menus read from the code - and the picture is the KAOS goal model the
 * project's parser reads from it. When the text stops parsing, the last
 * version that did stays on screen, dimmed, until it parses again. Save
 * writes nothing unless the parser accepts the text. Plain text is there for
 * what the gaps do not cover.
 */
export function AuthorPage() {
  const [catalogState, setCatalogState] = useState<
    | { status: 'loading' }
    | { status: 'ready'; catalog: AuthoringCatalog }
    | { status: 'error'; error: Error }
  >({ status: 'loading' });

  const load = useCallback(() => {
    setCatalogState({ status: 'loading' });
    fetchCatalog().then(
      (catalog) => setCatalogState({ status: 'ready', catalog }),
      (error: Error) => setCatalogState({ status: 'error', error }),
    );
  }, []);
  useEffect(load, [load]);

  return (
    <div className="flex w-full flex-col gap-5">
      <header className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-2xl lg:text-3xl">Write a requirement</h1>
      </header>
      {catalogState.status === 'loading' ? <Loading what="the authoring lists" /> : null}
      {catalogState.status === 'error' ? (
        <Notice tone="error" title="The authoring helper is not reachable">
          {catalogState.error instanceof HelperUnavailableError ? (
            <>
              Writing a requirement needs the project&apos;s parser. Start it from the repository
              root with <code>{HELPER_COMMAND}</code>, then{' '}
            </>
          ) : (
            <>{catalogState.error.message}. </>
          )}
          <Button size="sm" variant="quiet" onClick={load}>
            Try again
          </Button>
          . Reviewing rounds does not need it.
        </Notice>
      ) : null}
      {catalogState.status === 'ready' ? <Author catalog={catalogState.catalog} /> : null}
    </div>
  );
}

type CheckState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'done'; result: CheckResult; text: string }
  | { status: 'unavailable' };

function Author({ catalog }: { catalog: AuthoringCatalog }) {
  const { workspace, open } = useWorkspace();
  const [form, setForm] = useState<RequirementForm>(() => emptyForm(catalog));
  const [mode, setMode] = useState<'template' | 'text'>('template');
  const [raw, setRaw] = useState('');
  const [check, setCheck] = useState<CheckState>({ status: 'idle' });
  const [fileName, setFileName] = useState('R_new.dsl');
  const [saved, setSaved] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [zoom, setZoom] = useState<'fit' | 'full'>('fit');
  const [lastGood, setLastGood] = useState<KaosLayout | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const text = mode === 'template' ? toDsl(form) : raw;
  const problems = useMemo(
    () => (mode === 'template' ? formProblems(form, catalog) : []),
    [mode, form, catalog],
  );

  // the live check: the project's parser on the current text, 300 ms after the last change
  useEffect(() => {
    setSaved(null);
    if (!text.trim()) {
      setCheck({ status: 'idle' });
      return;
    }
    setCheck((c) => (c.status === 'done' ? c : { status: 'checking' }));
    let live = true;
    const t = window.setTimeout(() => {
      checkRequirement(text).then(
        (result) => live && setCheck({ status: 'done', result, text }),
        () => live && setCheck({ status: 'unavailable' }),
      );
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [text]);

  const current = check.status === 'done' && check.text === text ? check.result : null;
  const latest = check.status === 'done' ? check.result : null;
  const backToTemplate = current?.ok ? fromCheck(current, catalog) : null;
  const run = useRunTest({ text, fileName, open });

  // the picture: the goal model of the latest text that parsed
  const layout = useMemo(
    () =>
      latest?.ok
        ? layoutKaos(buildGoalModel(modelSourceFromCheck(latest)), { obstacles: [] })
        : null,
    [latest],
  );
  useEffect(() => {
    if (layout?.ok) setLastGood(layout);
  }, [layout]);
  const shown = layout?.ok ? layout : lastGood;
  const stale = !layout?.ok && Boolean(lastGood);

  const loadText = async (dsl: string, from: string) => {
    setNotice(null);
    try {
      const result = await checkRequirement(dsl);
      const back = result.ok ? fromCheck(result, catalog) : null;
      if (back && 'form' in back) {
        setForm(back.form);
        setMode('template');
        setNotice(`Loaded ${from}.`);
      } else {
        setRaw(dsl);
        setMode('text');
        setNotice(
          result.ok
            ? `Loaded ${from} as plain text: ${(back as { reason: string }).reason}.`
            : `Loaded ${from} as plain text: it does not parse yet.`,
        );
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const save = async () => {
    setSaveError(null);
    setSaved(null);
    try {
      const result = await checkRequirement(text);
      if (!result.ok) {
        setSaveError(
          `Not saved: the parser rejects it${result.error.line ? ` at line ${result.error.line}, column ${result.error.column}` : ''}.`,
        );
        return;
      }
      const name = fileName.trim().replace(/[\\/]/g, '_') || 'R_new.dsl';
      const withExt = name.endsWith('.dsl') ? name : `${name}.dsl`;
      downloadText(withExt, text);
      if (workspace?.source.canWrite) {
        await workspace.source.writeText(withExt, text);
        setSaved(`Saved as ${withExt} in ${workspace.source.label}, and downloaded.`);
      } else {
        setSaved(`Downloaded ${withExt}. A run uses it through REAL_REQUIREMENT_FILE.`);
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    }
  };

  const status =
    check.status === 'unavailable'
      ? { tone: 'fail', text: 'parser not reachable' }
      : check.status === 'checking' || (check.status === 'done' && !current)
        ? { tone: 'muted', text: 'checking…' }
        : current?.ok
          ? { tone: 'pass', text: 'parses' }
          : current && !current.ok
            ? { tone: 'fail', text: `line ${current.error.line ?? '?'}: does not parse` }
            : { tone: 'muted', text: 'empty' };

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-wrap items-center gap-2 px-4 py-2.5">
        <div className="flex rounded-lg bg-fill p-0.5" role="group" aria-label="Editing mode">
          {(['template', 'text'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              disabled={
                m === 'template' && mode === 'text' && !(backToTemplate && 'form' in backToTemplate)
              }
              title={
                m === 'template' && backToTemplate && 'reason' in backToTemplate
                  ? `The gaps cannot hold this text: ${backToTemplate.reason}`
                  : undefined
              }
              onClick={() => {
                if (m === mode) return;
                if (m === 'text') {
                  setRaw(toDsl(form));
                  setMode('text');
                } else if (backToTemplate && 'form' in backToTemplate) {
                  setForm(backToTemplate.form);
                  setMode('template');
                }
              }}
              className={cx(
                'rounded-md px-3 py-1 text-xs transition-all duration-fast disabled:cursor-not-allowed disabled:opacity-50',
                mode === m
                  ? 'bg-surface-raised font-medium text-text shadow-[0_1px_3px_rgb(0_0_0/0.12)] dark:bg-[#5a5a5e]'
                  : 'text-text-muted hover:text-text',
              )}
            >
              {m === 'template' ? 'Fill the gaps' : 'Plain text'}
            </button>
          ))}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".dsl,text/plain"
          className="sr-only"
          aria-label="Load a requirement file"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) {
              setFileName(file.name);
              await loadText(await file.text(), file.name);
            }
            e.target.value = '';
          }}
        />
        <Button size="sm" onClick={() => fileRef.current?.click()}>
          Load a .dsl…
        </Button>
        <Button
          size="sm"
          variant="quiet"
          onClick={() => {
            setForm(emptyForm(catalog));
            setMode('template');
            setNotice(null);
          }}
        >
          Start blank
        </Button>
        <span
          role="status"
          className={cx(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs',
            status.tone === 'pass' && 'bg-pass-soft text-pass',
            status.tone === 'fail' && 'bg-fail-soft text-fail',
            status.tone === 'muted' && 'bg-fill text-text-muted',
          )}
        >
          <span aria-hidden="true">
            {status.tone === 'pass' ? '✓' : status.tone === 'fail' ? '✕' : '·'}
          </span>
          {status.text}
        </span>
        {notice ? <span className="text-xs text-text-muted">{notice}</span> : null}
        <span className="ml-auto flex items-center gap-2">
          <input
            aria-label="File name"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            className="w-40 rounded-lg border border-border bg-surface-raised px-2.5 py-1 font-mono text-xs text-text"
          />
          {problems.length || (current && !current.ok) ? (
            <span className="text-xs text-human">
              {problems.length
                ? `Fill ${problems.length} gap${problems.length === 1 ? '' : 's'} to run`
                : 'Fix the text to run'}
            </span>
          ) : null}
          <Button size="sm" onClick={save} disabled={problems.length > 0 || !current?.ok}>
            Save
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void run.start()}
            // a followed job can always be looked at; a new run needs a complete requirement
            disabled={!run.running && (problems.length > 0 || !current?.ok)}
            busy={Boolean(run.running)}
            title="choose, check and run this requirement on the cluster, or open its latest result"
          >
            {run.running ?? 'Run test ▸'}
          </Button>
        </span>
      </div>
      {saveError ? <Notice tone="error">{saveError}</Notice> : null}
      {saved ? <Notice tone="success">{saved}</Notice> : null}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="card flex min-w-0 flex-col gap-3 p-4" aria-label="Source">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <h2 className="text-base font-semibold">Requirement</h2>
          </div>
          {mode === 'template' ? (
            <div className="overflow-x-auto">
              <TemplateEditor form={form} setForm={setForm} catalog={catalog} check={current} />
            </div>
          ) : (
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              spellCheck={false}
              aria-label="Requirement text"
              className="dsl min-h-[28rem] w-full resize-y border border-border font-mono focus-visible:border-human"
            />
          )}
          {mode === 'text' ? (
            <p className="text-xs text-text-muted">
              For what the gaps do not cover: {catalog.not_covered.join('; ')}.
            </p>
          ) : null}
          <Disclosure
            summary={`Checks${current && !current.ok ? ' - does not parse' : ''}${problems.length ? ` · ${problems.length} gap${problems.length === 1 ? '' : 's'} to fill` : ''}`}
          >
            <Checks check={check} current={current} problems={problems} />
          </Disclosure>
        </section>

        <div className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-16">
          <section className="card flex min-w-0 flex-col gap-3 p-4" aria-label="Goal model preview">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">Goal model</h2>
              <span className={cx('text-xs', stale ? 'text-caution' : 'text-text-muted')}>
                {stale ? 'last version that parsed - fix the marked line to update' : ''}
              </span>
              <div className="ml-auto flex rounded-lg bg-fill p-0.5" role="group" aria-label="Zoom">
                {(['fit', 'full'] as const).map((z) => (
                  <button
                    key={z}
                    type="button"
                    aria-pressed={zoom === z}
                    onClick={() => setZoom(z)}
                    className={cx(
                      'rounded-md px-2.5 py-0.5 text-[11px]',
                      zoom === z
                        ? 'bg-surface-raised font-medium text-text shadow-[0_1px_3px_rgb(0_0_0/0.12)] dark:bg-[#5a5a5e]'
                        : 'text-text-muted',
                    )}
                  >
                    {z === 'fit' ? 'Fit' : '100%'}
                  </button>
                ))}
              </div>
            </div>
            {layout && !layout.ok ? (
              <Notice tone="info" title="No diagram for this text">
                {layout.reason}.
              </Notice>
            ) : null}
            {shown ? (
              <div
                className={cx(
                  'motion-safe:transition-opacity motion-safe:duration-base',
                  stale && 'opacity-45',
                )}
              >
                <KaosDiagram
                  layout={shown}
                  selectedObstacleId={null}
                  onSelectObstacle={() => {}}
                  fit={zoom === 'fit'}
                  withObstacles={false}
                  legend={false}
                />
              </div>
            ) : (
              <p className="py-16 text-center text-sm text-text-muted">
                The goal model appears once the requirement parses.
              </p>
            )}
          </section>
          <MatchingRuns text={text} parses={Boolean(current?.ok)} />
        </div>
      </div>
      {run.shown ? (
        <RunDialog
          state={run.state}
          fileName={fileName}
          onFileName={setFileName}
          actions={{
            check: (o) => void run.check(o),
            back: run.back,
            submit: () => void run.submit(),
            close: run.close,
            openExisting: () => void run.openExisting(),
            openResults: (id) => void run.openResults(id),
            retry: () => void run.retry(),
            dismiss: run.dismiss,
          }}
        />
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ checks

function Checks({
  check,
  current,
  problems,
}: {
  check: CheckState;
  current: CheckResult | null;
  problems: string[];
}) {
  return (
    <section className="card flex flex-col gap-3 p-4" aria-label="Checks" aria-live="polite">
      <h2 className="text-base font-semibold">Checks</h2>
      {check.status === 'unavailable' ? (
        <Notice tone="error">
          The parser is not reachable: start <code>{HELPER_COMMAND}</code>.
        </Notice>
      ) : null}
      {check.status === 'checking' || (check.status === 'done' && !current) ? (
        <p className="text-sm text-text-muted">Checking…</p>
      ) : null}
      {problems.length ? (
        <ul className="list-disc pl-4 text-sm text-text-muted">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
      {current && !current.ok ? (
        <Notice
          tone="error"
          title={`Does not parse${current.error.line ? ` (line ${current.error.line}, column ${current.error.column})` : ''}`}
        >
          <pre className="mt-1 overflow-x-auto font-mono text-xs whitespace-pre-wrap">
            {current.error.message}
          </pre>
        </Notice>
      ) : null}
      {current?.ok ? (
        <ul className="flex flex-col gap-1.5 text-sm">
          <CheckLine ok>Parses with the project&apos;s grammar.</CheckLine>
          {(['perception', 'braking'] as const).map((role) => {
            const m = current.modules[role];
            return (
              <CheckLine key={role} ok={Boolean(m.module && m.runs)}>
                {m.module ? (
                  <>
                    {role === 'perception' ? 'Detector' : 'Braking'} <FileName>{m.module}</FileName>{' '}
                    {m.runs
                      ? 'is run by the executor.'
                      : 'is not implemented by the executor: a run would use a different module.'}
                  </>
                ) : (
                  <>
                    No module on “{m.task}”: the executor would use its default{' '}
                    {m.default ? <FileName>{m.default}</FileName> : null}.
                  </>
                )}
              </CheckLine>
            );
          })}
          <CheckLine ok={!current.assumptions.some((a) => a.kind === 'rejected')}>
            {current.assumptions.length
              ? `${current.assumptions.length} assumption${current.assumptions.length === 1 ? '' : 's'}: ${countKinds(current.assumptions)}.`
              : 'No assumption stated: every failure will count as the car’s.'}
          </CheckLine>
          <CheckLine ok={!current.soft_goals.some((a) => a.kind === 'rejected')}>
            {current.soft_goals.length
              ? `${current.soft_goals.length} soft goal${current.soft_goals.length === 1 ? '' : 's'}: ${countKinds(current.soft_goals)}.`
              : 'No soft goal stated: nothing beyond safety can fail.'}
          </CheckLine>
          {current.covered ? (
            <CheckLine ok={false}>The form cannot hold this text: {current.covered}.</CheckLine>
          ) : null}
        </ul>
      ) : null}
    </section>
  );
}

function countKinds(items: ClassifiedItem[]): string {
  const words: Record<string, string> = {
    scenario: 'checked on settings',
    run: 'checked on runs',
    checked: 'measurable',
    free_text: 'not checked',
    rejected: 'rejected',
  };
  const counts = new Map<string, number>();
  for (const i of items) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);
  return [...counts].map(([k, n]) => `${n} ${words[k] ?? k}`).join(', ');
}

function CheckLine({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span aria-hidden="true" className={cx('mt-0.5 text-xs', ok ? 'text-pass' : 'text-caution')}>
        {ok ? '✓' : '!'}
      </span>
      <span className="sr-only">{ok ? 'pass: ' : 'attention: '}</span>
      <span>{children}</span>
    </li>
  );
}
