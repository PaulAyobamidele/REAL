import type { Route } from '@/state/route';
import { STUDY } from '@/study/config';
import { authorTitle } from '@/study/labels';

/**
 * The guided tour of each page: a few stops, each a part of the page found by
 * its accessible name (so a stop cannot drift from what it points at), with
 * one or two sentences. Stops whose part is not on screen are skipped.
 */
export interface TourStop {
  /** a CSS selector for the part of the page; null: a stop in the middle of the screen */
  element: string | null;
  title: string;
  text: string;
}

const INSTRUCTIONS = '[role="note"][aria-label="Instructions"]';
const WAY_ON = '[data-tour="way-on"]';
const WORKFLOW = 'nav[aria-label="Workflow"]';
const TOUR_BUTTON = 'button[aria-label="Take the tour of this page"]';

const wayOn = (text: string): TourStop => ({ element: WAY_ON, title: 'The way on', text });
const instructions = (text: string): TourStop => ({
  element: INSTRUCTIONS,
  title: 'What to do here',
  text,
});

/** The tour's key: one tour per page (each review step is its own page). */
export function tourKey(route: Route): string | null {
  switch (route.screen) {
    case 'overview':
    case 'author':
    case 'manual':
    case 'workspace':
    case 'lineage':
      return route.screen;
    case 'example':
      return 'example';
    case 'review':
      return `step${route.step}`;
    default:
      return null;
  }
}

export function tourOf(key: string): TourStop[] {
  switch (key) {
    case 'overview':
      return [
        {
          element: WORKFLOW,
          title: 'The workflow',
          text: 'The stops you go through, in order. The page you are on is ringed; finished stops get a tick, and each stop is a link.',
        },
        instructions(
          'Every page opens with a box like this one: what the page is for, then the action to take, after the arrow.',
        ),
        {
          element: 'section[aria-label="Help video"]',
          title: 'A short introduction',
          text: 'Prefer to watch? The video walks through the tool step by step.',
        },
        {
          element: 'section[aria-label="Overview of the tool"]',
          title: 'How REAL works',
          text: 'From the requirement, through the simulations and their analysis, to the revised requirement.',
        },
        wayOn('The way on is always one button, centred at the bottom of the page.'),
        {
          element: TOUR_BUTTON,
          title: 'This tour, again',
          text: 'Every page has its own tour. Replay it any time from here.',
        },
      ];
    case 'author':
      return [
        instructions(
          STUDY
            ? 'This requirement has already been tested: read it here, then open its results.'
            : 'Load a requirement written in REAL-DSL, or write one, then start its compliance test.',
        ),
        {
          element: '[role="group"][aria-label="Editing mode"]',
          title: 'Two ways to write',
          text: 'The REAL-DSL editor, or a template with gaps to fill. Load a .dsl… opens a file from your computer.',
        },
        {
          element: 'section[aria-label="Source"]',
          title: STUDY ? 'The requirement in REAL-DSL' : 'The REAL-DSL editor',
          text: STUDY
            ? 'Read only, with keywords in colour. Hover a word for a short explanation.'
            : 'Keywords in colour, Ctrl+Space for suggestions that follow the grammar, hover a word for help. A mistake is marked on its line.',
        },
        {
          element: 'button[aria-label="Dark editor"]',
          title: 'Light or dark',
          text: 'Switch the editor’s theme; your choice is kept.',
        },
        {
          element: 'section[aria-label="Goal model preview"]',
          title: 'The goal model',
          text: 'The same requirement as a diagram. Point at any part of the text and its box is marked here.',
        },
        {
          element: '[aria-label="Legend"]',
          title: 'Every shape, named',
          text: 'What each shape stands for, and the REAL-DSL words that write it.',
        },
        wayOn(
          STUDY
            ? 'Start Running Compliance Test opens the review of this requirement.'
            : 'Start Running Compliance Test checks the requirement and runs it on the cluster.',
        ),
      ];
    case 'step1':
      return [
        {
          element: WORKFLOW,
          title: 'Where you are',
          text: 'The review has five steps and a worked example. The track fills as you go.',
        },
        instructions('Read the requirement this round ran with before looking at its results.'),
        {
          element: 'section[aria-label="The requirement"]',
          title: 'The requirement as run',
          text: 'Switch between its text and its goal model.',
        },
        {
          element: 'section[aria-label="The system it selected"]',
          title: 'The system under test',
          text: 'The detector and the braking module the simulator ran, and the assumptions and soft goals it was judged by.',
        },
        {
          element: 'section[aria-label="Scenario space and scoring"]',
          title: 'What was tested',
          text: 'How many scenarios, how many runs of each, and how a run is scored.',
        },
        wayOn('Next, one test case in detail.'),
      ];
    case 'example':
      return [
        instructions(
          'The best scenario: the test case in which the system fails most often, the worst case for the car.',
        ),
        {
          element: 'figure[aria-label="CARLA recording"]',
          title: 'What the camera saw',
          text: 'CARLA’s recording of this test case: a separate re-run made for the video.',
        },
        {
          element: '[role="group"][aria-label="Run to replay"]',
          title: 'One run at a time',
          text: 'Switch between its runs to compare a failed run with one that passed.',
        },
        {
          element: 'ol[aria-label="Moments in this run"]',
          title: 'The moments that decide',
          text: 'When the car braked, when the detector saw the pedestrian, how close the car came. Select one to jump the replay there.',
        },
        wayOn('Then the whole test: every test case, every run.'),
      ];
    case 'step2':
      return [
        instructions(
          'What a test case, a run, a pass and a failure mean here. Each box on this page explains the part under it.',
        ),
        {
          element: 'section[aria-label="Summary"]',
          title: 'The counts',
          text: 'Every number opens the simulations behind it.',
        },
        {
          element: 'section[aria-labelledby="parts-title"]',
          title: 'What failed',
          text: 'Each part of the requirement, judged on its own: failed, broken, held, or not checked.',
        },
        {
          element: 'section[aria-label="Where it failed"]',
          title: 'Where it failed',
          text: 'The requirement beside the list, the failed parts marked in red and the broken ones in amber. Point at a row to find its part.',
        },
        {
          element: 'section[aria-labelledby="cases-title"]',
          title: 'Every test case',
          text: 'Filter to the ones with a failure, expand a test case to see its runs; the icons download the data.',
        },
        wayOn('Next, why the failures happened.'),
      ];
    case 'step3':
      return [
        instructions('The failures grouped into obstacles, each with its evidence.'),
        {
          element: 'section[aria-label="Requirement as a goal model"]',
          title: 'The obstacles',
          text: 'Each obstacle is attached to the goal it blocks. Select one, here or in the list above the diagram.',
        },
        {
          element: 'section[aria-label="Failures, video, evidence"]',
          title: 'The evidence',
          text: 'The runs behind the selected obstacle, the recording, and each run’s trace.',
        },
        {
          element: 'section[aria-labelledby="patterns-title"]',
          title: 'Patterns',
          text: 'Every run as a dot, runs that unfolded alike close together. The selected obstacle’s runs are ringed.',
        },
        wayOn('Next, your decisions.'),
      ];
    case 'step4':
      return [
        instructions(
          'For each obstacle, decide: does the world explain these failures, or is the car at fault?',
        ),
        {
          element:
            '[role="note"][aria-label="What this means"], [role="note"][aria-label="What the tool says"]',
          title: 'What it means',
          text: 'The obstacle in plain words, always in the same place on its card.',
        },
        {
          element: '[data-tour="decision"]',
          title: 'Your decision',
          text: 'The world explains it: its assumption is added to the refined requirement for you. The car is at fault: it remains a failure, decided in the next step.',
        },
        {
          element: 'section[aria-labelledby="scope-title"]',
          title: 'Scope',
          text: 'Runs set aside by a rule or flagged as test artefacts: say whether each was right.',
        },
        {
          element: 'section[aria-labelledby="assumptions-title"]',
          title: 'Domain assumptions',
          text: 'Keep, tighten, loosen or drop what the requirement assumes about the world.',
        },
        wayOn('Next, the refined requirement.'),
      ];
    case 'step5':
      return [
        instructions(
          'The refined requirement, with what you accepted already added, and the failures that remain.',
        ),
        {
          element: 'section[aria-label="Refined requirement"]',
          title: 'The refined requirement',
          text: 'The lines added from your triage are outlined in green; where the runs allow, how many failures still count against the car.',
        },
        {
          element: 'section[aria-label="Failures that remain"]',
          title: 'What remains',
          text: 'For each: refine the requirement, confirm a real system failure and choose a fix, or leave it for the next round.',
        },
        {
          element: 'section[aria-label="Changes"]',
          title: 'Every change',
          text: 'Each change the refined requirement makes, labelled by kind: system, assumption, requirement or test.',
        },
        {
          element: 'section[aria-label="R0 and R1"]',
          title: 'Before and after',
          text: STUDY
            ? 'The requirement before and after, side by side.'
            : 'R0 and R1 side by side; edit R1 here to make a refinement you described.',
        },
        {
          element: 'section[aria-label="Sign"]',
          title: 'Sign',
          text: STUDY
            ? 'When nothing is left to decide, sign: a file downloads for the researcher.'
            : 'When nothing is left to decide, sign: the decisions and R1 are written into the round folder.',
        },
      ];
    case 'manual':
      return [
        {
          element: 'nav[aria-label="Manual sections"]',
          title: 'The sections',
          text: 'Jump to any section; the one you are reading is marked.',
        },
        {
          element: 'article.manual',
          title: 'The REAL-DSL manual',
          text: 'How to write a requirement, what each keyword means, and what the tool checks. Examples are coloured as in the editor.',
        },
        wayOn(`Back to ${authorTitle()} when you are ready.`),
      ];
    case 'workspace':
      return [
        {
          element: 'section[aria-labelledby="loaded-title"]',
          title: 'Your rounds',
          text: 'The test rounds in this workspace. Open one to review it.',
        },
      ];
    case 'lineage':
      return [
        {
          element: 'ol[aria-label="Rounds in order"]',
          title: 'Round after round',
          text: 'Each round, oldest first, with what changed between them and why.',
        },
      ];
    default:
      return [];
  }
}
