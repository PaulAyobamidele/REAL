/** The five step names, verbatim from the Streamlit page. */
export const STEP_NAMES = [
  'The requirement under test',
  'Test Execution Report',
  'Failure Analysis',
  'Obstacle triage',
  'Requirement revision',
] as const;

/** The worked example between steps 1 and 2: the round's best scenario. */
export const EXAMPLE_NAME = 'Example: the best scenario';

/** What to do on each step: one short action per line, the last one says how to go on. */
export const STEP_CAPTIONS: readonly (readonly string[])[] = [
  [
    'Read the requirement this round ran with: what the car must do, the modules that do it, the domain assumptions it relies on and its soft goals.',
    'When you are ready, see a worked example of one test case, then how the whole test went.',
  ],
  [
    'Check what was tested, how many simulations passed or failed, and which part of the requirement failed.',
    'Open any failed simulation to see what happened, then press Next.',
  ],
  [
    'The failures are grouped into obstacles, each attached to the goal it blocks. Open the evidence behind any of them: counts, failure rates and recorded simulations.',
    'When you have a view of what went wrong, press Next.',
  ],
  [
    'For each obstacle, choose accept, rename, reject or defer, and give your reason in your own words.',
    'Then decide whether each domain assumption stays as it is, and press Next.',
  ],
  [
    'Compare the requirement with its revision side by side and check every change.',
    'When you agree, sign: signing records your decisions.',
  ],
];
