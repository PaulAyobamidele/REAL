import { useEffect, useRef, useState, type ReactNode } from 'react';

import architecture from '@/assets/real_architecture.png';
import { Instructions } from '@/components/ui/Instructions';
import { HELP_VIDEO_URL, youtubeEmbed } from '@/config/help';
import { routeHash } from '@/state/route';
import { STUDY } from '@/study/config';
import { authorTitle } from '@/study/labels';

/**
 * The first page: what the tool is and how a round goes (normal build), or
 * what the study is and what the participant will do (study build). The
 * study text stays neutral: it says what to do, never which failures matter.
 */
export function OverviewPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-8 [&>*]:w-full [&>*]:max-w-3xl">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <h1 className="text-2xl lg:text-3xl">{STUDY ? 'Overview' : 'How REAL works'}</h1>
        <p className="prose-width text-base text-text-muted">
          A Tool for Refining Autonomous Systems Requirements through Compliance Failure Analysis
        </p>
      </header>
      {STUDY ? <StudyOverview /> : <ToolOverview />}
      <div className="flex justify-center">
        <a
          href={routeHash({ screen: STUDY ? 'author' : 'workspace' })}
          className="rounded-full bg-action-primary px-5 py-2 text-sm font-medium text-action-primary-text no-underline hover:brightness-105"
        >
          {STUDY ? `Continue to the ${authorTitle()}` : 'Continue to the Workspace'} →
        </a>
      </div>
    </div>
  );
}

function StudyOverview() {
  return (
    <>
      <Instructions>
        Read this page first. It describes what you will do; the screens after it say what to do at
        each step.
      </Instructions>
      <HelpVideo />
      <Section title="What this study is about">
        <p>
          When an autonomous system is tested in simulation, some tests fail. Deciding what a
          failure means, and what should change because of it, is a human judgement. This study
          looks at how engineers make that judgement: everyone sees the same test results, and we
          compare what different people decide. There are no right or wrong answers.
        </p>
      </Section>
      <Section title="The system under test">
        <p>
          An automated-braking car. A camera-based detector looks for pedestrians and a braking
          controller slows the car down. It is tested in a driving simulator on many scenarios: a
          pedestrian (adult or child, light or dark clothing) crosses the road in front of the car,
          in different fog, light and road conditions, sometimes from behind a parked car. Each
          scenario is run several times.
        </p>
      </Section>
      <Schema />
      <Section title="What you will do">
        <Steps
          items={[
            [
              authorTitle(),
              'Read the requirement under test: what the car must do, the modules that do it, the domain assumptions it relies on, and its soft goals.',
            ],
            [
              'Run the test',
              'Run the requirement against the scenarios. When the run is done, its Test Execution Result opens.',
            ],
            [
              'Review the results',
              'Five steps: the requirement under test, the test execution result, the failure analysis (counts, failure rates, recorded simulations), obstacle triage, and requirement revision.',
            ],
            [
              'Decide',
              'For each obstacle: accept, rename, reject or defer it, and say why in your own words. For each obstacle you accept, choose one fix. Decide whether each domain assumption stays as it is.',
            ],
            [
              'Sign',
              'Check your revised requirement and sign. A file downloads; please send it to the researcher. Signing ends the session.',
            ],
          ]}
        />
        <p className="mt-3 text-text-muted">
          You can move between the steps as often as you like until you sign. The session takes
          about 40 to 50 minutes.
        </p>
      </Section>
      <Section title="What is recorded">
        <p>
          Your decisions and your reasons, your revised requirement, and a log of what you open and
          change, under an anonymous ID. Your name is not recorded. Nothing is uploaded: the file
          you send is the only copy that leaves your computer.
        </p>
      </Section>
    </>
  );
}

function ToolOverview() {
  return (
    <>
      <Instructions>
        Start here, then open the Workspace to review a round, or Write a requirement to test a new
        one.
      </Instructions>
      <HelpVideo />
      <Section title="What REAL is for">
        <p>
          REAL turns the failures an autonomous system shows in simulation into a revised
          requirement. It keeps three things apart: the system (<Code>performed by</Code>), the
          domain it is assumed to work in (<Code>assuming</Code>), and what it must achieve (the
          goal and its <Code>ensuring</Code> soft goals). A failure counts against the system only
          when the domain assumptions held.
        </p>
      </Section>
      <Schema />
      <Section title="One round, step by step">
        <Steps
          items={[
            [
              'Write a requirement',
              'In the requirement language, with a live goal model. The parser checks every edit; module names must be ones the simulator implements.',
            ],
            [
              'Run the test',
              'A grammar generates the scenarios (an exhaustive grid, a list, or a search). Each runs in the CARLA simulator with the detector in the loop, as a job on a GPU cluster. Before submitting, the scenes and the cluster code are checked; partial results arrive while it runs.',
            ],
            [
              'Test Execution Result',
              'Every simulation is judged from its recorded trace: the path-aware safety rule, each assumption held or broken, each soft goal met or missed. Runs that did not test anything are set aside, not counted as passes.',
            ],
            [
              'Failure Analysis',
              'Failures grouped into obstacles, each with its evidence and attached to the goal it blocks; failure types from the traces; a map of behaviours; whether each assumption mattered.',
            ],
            [
              'Obstacle triage',
              'You decide each obstacle and each assumption, with a reason, and choose a fix at the data, model, system or requirement layer. The tool only suggests.',
            ],
            [
              'Requirement revision',
              'The revised requirement R1 beside R0, every change labelled [S] system, [D] assumption, [R] requirement or [T] test. Signing records the decisions; [D] and [R] changes are re-judged on the stored traces, [S] changes start the next round.',
            ],
          ]}
        />
      </Section>
      <Section title="Where things are">
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>
            <strong>Workspace</strong>: the rounds you have (open a folder of run folders), and the
            way into each review.
          </li>
          <li>
            <strong>Write a requirement</strong>: the editor, and Run test.
          </li>
          <li>
            <strong>Rounds</strong>: how a requirement changed from round to round, and why.
          </li>
        </ul>
        <p className="mt-3 text-text-muted">
          Every result is a file in a run folder, so any analysis can be recomputed without the
          simulator.
        </p>
      </Section>
    </>
  );
}

/** The tool's architecture (the paper's Fig. 1, docs/paper/latex/figures/fig1_architecture.png). */
function Schema() {
  return (
    <section
      className="card flex !max-w-6xl flex-col gap-3 p-5 text-sm leading-6"
      aria-label="Overview of the tool"
    >
      <h2 className="text-lg">Overview of the tool</h2>
      <figure className="flex flex-col gap-2">
        <a
          href={architecture}
          target="_blank"
          rel="noreferrer"
          className="no-underline"
          title="Open the full-size figure"
        >
          <img
            src={architecture}
            alt="REAL's architecture in three lanes. The engineer writes the requirement R0, and at the end decides and signs the revised requirement R1. The tool: input (the requirement, with IDE support), 1 requirement check, 2 test generation and execution, 3 diagnosis, 4 requirement and domain-assumption refinement. The GPU cluster runs the simulation job: scenario search, Scenic and CARLA, the system under test, and a monitor using the same safety rule as step 3, writing traces to a run folder that feeds the diagnosis. After refinement, system changes start a new round, assumption and requirement changes are re-diagnosed without a new run, and R1 becomes the next input."
            className="w-full rounded-lg border border-border bg-white"
          />
        </a>
        <figcaption className="text-xs text-text-muted">
          The engineer writes the requirement and, at the end, decides and signs the revision;
          everything in between is computed. Select the figure to open it full size.
        </figcaption>
      </figure>
    </section>
  );
}

/** The instructional video: a play button that opens it in a pop-up on the page. */
function HelpVideo({ url = HELP_VIDEO_URL }: { url?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="card flex flex-wrap items-center gap-4 p-5" aria-label="Help video">
      <button
        type="button"
        disabled={!url}
        onClick={() => setOpen(true)}
        aria-label="Play the introduction video"
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-action-primary text-lg text-action-primary-text hover:brightness-105 disabled:cursor-default disabled:hover:brightness-100"
      >
        <span aria-hidden="true">▶</span>
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 className="text-base">Watch the introduction</h2>
        <p className="text-sm text-text-muted">
          A short video that walks through the tool, step by step.
        </p>
      </div>
      {open && url ? <VideoDialog url={url} onClose={() => setOpen(false)} /> : null}
    </section>
  );
}

/** The video over the page; Escape, the × or a click outside closes it. */
export function VideoDialog({ url, onClose }: { url: string; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    close.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const embed = youtubeEmbed(url);
  return (
    // a click on the dimmed backdrop closes it too; the keyboard has Escape and the ×
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Introduction video"
        className="card flex w-full max-w-5xl flex-col gap-3 p-4 shadow-xl"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg">Introduction video</h2>
          <button
            ref={close}
            type="button"
            aria-label="Close the video"
            onClick={onClose}
            className="rounded-full px-2 text-2xl leading-none text-text-muted hover:bg-fill"
          >
            ×
          </button>
        </div>
        <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
          {embed ? (
            <iframe
              src={embed}
              title="Introduction video"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              className="size-full border-0"
            />
          ) : (
            // a video file (not YouTube): its captions, if any, are in the file
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={url} controls autoPlay className="size-full" />
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card flex flex-col gap-2 p-5 text-sm leading-6">
      <h2 className="text-lg">{title}</h2>
      {children}
    </section>
  );
}

function Steps({ items }: { items: [string, string][] }) {
  return (
    <ol className="flex flex-col gap-3">
      {items.map(([title, text], i) => (
        <li key={title} className="flex gap-3">
          <span
            aria-hidden="true"
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-text text-xs font-semibold text-white"
          >
            {i + 1}
          </span>
          <span>
            <strong>{title}.</strong> {text}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-surface-sunken px-1 font-mono text-[12px]">{children}</code>;
}
