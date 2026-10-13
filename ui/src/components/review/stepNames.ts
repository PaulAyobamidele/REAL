/** The five step names, verbatim from the Streamlit page. */
export const STEP_NAMES = [
  'The requirement under test',
  'Test Execution Result',
  'Failure Analysis',
  'Obstacle triage',
  'Requirement revision',
] as const;

export const STEP_CAPTIONS = [
  'The requirement this round ran with.',
  'What was tested, what passed and failed, and which part of the requirement failed.',
  'The goal model, the evidence, the candidate fixes.',
  'Your verdicts, in your own words.',
  'The requirement side by side with its proposal. Sign to record.',
] as const;
