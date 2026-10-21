import { useRef, useState, type DragEvent } from 'react';

import { EmptyState, FileErrorNotice } from '@/components/feedback';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { RoundRow } from '@/components/lineage/RoundRow';
import { Disclosure } from '@/components/ui/Disclosure';
import { Notice } from '@/components/ui/Notice';
import { FileName } from '@/components/ui/Section';
import { ROUND_STATE_WORDS, roundState } from '@/domain/lineage';
import {
  directoryPickerSupported,
  DroppedFilesSource,
  filesFromDataTransfer,
  filesFromInput,
  isKnownFile,
  pickDirectory,
} from '@/services/workspace';
import { HELPER_COMMAND, projectRunsSource } from '@/services/authoring';
import { reviewHash, routeHash } from '@/state/route';
import { useWorkspace } from '@/state/WorkspaceContext';
import { cx, displayDate } from '@/utils/format';
import { STUDY } from '@/study/config';

/** Loading a workspace: where the files come from and which rounds were found. */
export function WorkspacePage({ focusRuns = null }: { focusRuns?: string[] | null } = {}) {
  const { state, workspace, exampleSource, probing, open, reload, close } = useWorkspace();
  const [dragging, setDragging] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const canPick = directoryPickerSupported();

  const openFolder = async () => {
    setOpenError(null);
    try {
      const source = await pickDirectory();
      if (source) await open(source);
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : String(error));
    }
  };

  const openProjectRuns = async () => {
    setOpenError(null);
    const source = await projectRunsSource();
    if (source) await open(source);
    else
      setOpenError(
        `The project's runs are served by the authoring helper, which is not running. Start it from the repository root: ${HELPER_COMMAND}`,
      );
  };

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    setOpenError(null);
    try {
      const files = await filesFromDataTransfer(event.dataTransfer);
      if (!files.length) {
        setOpenError('Nothing readable was dropped.');
        return;
      }
      await open(new DroppedFilesSource(files));
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <h1 className="text-2xl lg:text-3xl">Workspace</h1>
        <p className="prose-width text-base text-text-muted">
          {STUDY
            ? 'The test rounds of this requirement.'
            : 'A folder of run folders. Open one, drop one, or use the bundled example.'}
        </p>
      </header>

      {focusRuns?.length ? <FocusedRuns ids={focusRuns} /> : null}

      <a
        href={routeHash({ screen: 'author' })}
        className="card group flex flex-wrap items-center gap-x-6 gap-y-2 p-5 no-underline hover:no-underline"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-lg text-text">Write a requirement</h2>
          <p className="text-sm text-text-muted">
            A form for the requirement DSL: modules the executor runs, measurable assumptions and
            soft goals, checked by the project&apos;s parser as you type.
          </p>
        </div>
        <span className="rounded-full bg-human px-4 py-1.5 text-sm font-medium text-white transition-all duration-fast group-hover:brightness-110">
          Open the form →
        </span>
      </a>

      {/* the study build has one fixed source: no opening, dropping or example */}
      {STUDY ? null : (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="card flex flex-col gap-3 p-5">
            <h2 className="text-lg">Open a folder</h2>
            <p className="text-sm text-text-muted">
              {canPick
                ? 'Signing writes into the round folder.'
                : 'Needs Chrome or Edge to write back.'}
            </p>
            <div className="mt-auto flex flex-wrap gap-2">
              <Button
                variant={canPick ? 'primary' : 'secondary'}
                onClick={openFolder}
                disabled={!canPick}
              >
                Open a folder…
              </Button>
              <Button
                variant={canPick ? 'secondary' : 'primary'}
                onClick={openProjectRuns}
                title="artifacts/runs, read through the authoring helper (any browser)"
              >
                Open the project&apos;s runs
              </Button>
            </div>
          </div>
          <div
            className={cx(
              'card flex flex-col gap-3 border-dashed border-border-strong p-5 shadow-none',
              dragging && 'border-human bg-human-soft',
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <h2 className="text-lg">Drop a folder</h2>
            <p className="text-sm text-text-muted">Read-only; signing offers downloads.</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="sr-only"
              aria-label="Choose a workspace folder"
              // @ts-expect-error webkitdirectory is not in the React types
              webkitdirectory=""
              onChange={async (e) => {
                if (!e.target.files?.length) return;
                setOpenError(null);
                await open(new DroppedFilesSource(filesFromInput(e.target.files)));
                e.target.value = '';
              }}
            />
            <Button
              onClick={() => inputRef.current?.click()}
              className="mt-auto self-start"
              variant={canPick ? 'secondary' : 'primary'}
            >
              Choose a folder…
            </Button>
          </div>
          <div className="card flex flex-col gap-3 p-5">
            <h2 className="text-lg">Bundled example</h2>
            <p className="text-sm text-text-muted">
              {probing
                ? 'Looking…'
                : exampleSource
                  ? 'Real rounds from the project, labelled as example data.'
                  : 'None served next to this build.'}
            </p>
            {exampleSource ? (
              <Button onClick={() => open(exampleSource)} className="mt-auto self-start">
                Use the example
              </Button>
            ) : null}
          </div>
        </div>
      )}
      {openError ? <Notice tone="error">{openError}</Notice> : null}
      {state.status === 'error' ? (
        <FileErrorNotice
          error={state.error}
          consequence={`The workspace ${state.label} could not be loaded.`}
        />
      ) : null}
      {state.status === 'loading' ? (
        <p role="status" className="text-sm text-text-muted">
          Loading {state.label}…
        </p>
      ) : null}

      {workspace ? (
        <section className="flex flex-col gap-4" aria-labelledby="loaded-title">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="loaded-title" className="text-lg">
              {workspace.source.label}
            </h2>
            {workspace.source.isExample ? <Chip tone="tool">example data (bundled)</Chip> : null}
            <Chip tone="neutral">
              {workspace.source.canWrite
                ? 'writes into the folder'
                : 'read-only: signing downloads'}
            </Chip>
            <span className="text-xs text-text-faint">{displayDate(workspace.loadedAt)}</span>
            <span className="ml-auto flex gap-2">
              <Button size="sm" onClick={() => reload()}>
                Reload
              </Button>
              {STUDY ? null : (
                <Button size="sm" variant="quiet" onClick={close}>
                  Close
                </Button>
              )}
            </span>
          </div>

          {workspace.rounds.length === 0 && workspace.broken.length === 0 ? (
            STUDY ? (
              <EmptyState title="No test rounds yet">
                Write a requirement and run the test; its round appears here.
              </EmptyState>
            ) : (
              <EmptyState title="No rounds in this workspace">
                A round is a folder with a <FileName>run_meta.json</FileName>.
              </EmptyState>
            )
          ) : null}

          {workspace.rounds.map((round) => {
            const read = round.files.filter(isKnownFile);
            const other = round.files.filter((f) => !isKnownFile(f));
            const traces = read.filter((f) => f.startsWith('traces/')).length;
            const frames = read.filter((f) => f.startsWith('frames/')).length;
            const top = read.filter((f) => !f.includes('/'));
            return (
              <article
                key={round.dir}
                className="card flex flex-col gap-2 p-5"
                aria-labelledby={`ws-round-${round.dir}`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <h3
                    id={`ws-round-${round.dir}`}
                    className="font-mono text-sm font-semibold break-all"
                  >
                    {round.dir}
                  </h3>
                  <Chip tone="neutral">{ROUND_STATE_WORDS[roundState(round)]}</Chip>
                  <a href={reviewHash(round.id, 1)} className="ml-auto text-sm">
                    Open →
                  </a>
                </div>
                {round.note ? <p className="text-sm">{round.note}</p> : null}
                <Disclosure
                  summary={`Files (${top.length}${traces ? ` + ${traces} traces` : ''}${frames ? ` + ${frames} frames` : ''})`}
                  compact
                >
                  <p className="break-words text-xs text-text-muted">
                    {top.map((f) => (
                      <span key={f}>
                        <FileName>{f}</FileName>{' '}
                      </span>
                    ))}
                  </p>
                  {other.length ? (
                    <p className="text-xs text-text-faint">Not read: {other.join(', ')}</p>
                  ) : null}
                </Disclosure>
                {round.reportError ? (
                  <FileErrorNotice
                    error={round.reportError}
                    consequence="Not reviewable until the report loads."
                  />
                ) : null}
                {round.decisionsError ? (
                  <FileErrorNotice
                    error={round.decisionsError}
                    consequence="Verdicts start blank."
                  />
                ) : null}
                {!round.files.includes('analysis_report.json') ? (
                  <Notice tone="info">
                    Not yet analysed. Run{' '}
                    <code className="break-all">python -m scripts.analysis.report {round.dir}</code>
                    .
                  </Notice>
                ) : null}
              </article>
            );
          })}
          {workspace.broken.map((b) => (
            <article key={b.dir} className="card border-fail p-5">
              <h3 className="font-mono text-sm font-semibold">{b.dir}</h3>
              <FileErrorNotice
                error={b.error}
                consequence="Skipped; the other rounds are loaded."
              />
            </article>
          ))}
          {workspace.ignored.length ? (
            <p className="text-xs text-text-muted">
              Not rounds (no <FileName>run_meta.json</FileName>): {workspace.ignored.join(', ')}
            </p>
          ) : null}
        </section>
      ) : state.status === 'idle' ? (
        <EmptyState title="No workspace loaded">
          Open a folder, drop one, or use the bundled example.
        </EmptyState>
      ) : null}
    </div>
  );
}

/** The runs a requirement written in the form already has, first and in full. */
function FocusedRuns({ ids }: { ids: string[] }) {
  const { workspace, state } = useWorkspace();
  const found = workspace ? workspace.rounds.filter((r) => ids.includes(r.id)) : [];
  const missing = workspace ? ids.filter((id) => !workspace.rounds.some((r) => r.id === id)) : [];
  return (
    <section
      className="flex flex-col gap-3 rounded-2xl bg-human-soft/60 p-4 ring-1 ring-human/30"
      aria-labelledby="focused-title"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id="focused-title" className="text-lg">
          Runs of the requirement you wrote
        </h2>
        <span className="text-sm text-text-muted">
          {found.length} run{found.length === 1 ? '' : 's'} with exactly this requirement
        </span>
        <span className="ml-auto flex gap-3 text-sm">
          <a href={routeHash({ screen: 'author' })}>← Back to the form</a>
          <a href={routeHash({ screen: 'workspace' })}>Show all runs</a>
        </span>
      </div>
      {state.status === 'loading' ? (
        <p className="text-sm text-text-muted">Loading the runs…</p>
      ) : null}
      {found.map((round) => (
        <RoundRow key={round.id} round={round} />
      ))}
      {missing.length && workspace ? (
        <p className="text-xs text-text-muted">
          Not in {workspace.source.label}: {missing.join(', ')}.
        </p>
      ) : null}
    </section>
  );
}
