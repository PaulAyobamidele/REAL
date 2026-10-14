import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { emptyForm, formProblems, toDsl } from '@/domain/requirementForm';
import { AuthorPage } from '@/pages/AuthorPage';
import type { AuthoringCatalog } from '@/services/authoring';
import { WorkspaceProvider } from '@/state/WorkspaceContext';

const CATALOG: AuthoringCatalog = {
  temporal_ops: ['ACHIEVE', 'MAINTAIN'],
  operators: ['<=', '>=', '==', '!=', '<', '>'],
  roles: {
    perception: {
      task: 'Detect Pedestrian',
      modules: ['yolov5m', 'yolov5s'],
      default: 'yolov5s',
      source: 'model/',
    },
    braking: {
      task: 'Apply Brakes',
      modules: ['emergency_braking', 'proportional_braking'],
      default: 'emergency_braking',
      source: 'util.py',
    },
  },
  assumption_quantities: [
    { name: 'fog_density', level: 'scenario', unit: '%', source: 'grid', available: true },
    { name: 'lane_width_m', level: 'run', unit: 'm', source: 'x', available: false },
  ],
  soft_goal_quantities: [{ name: 'resume_within_s', meaning: 'seconds' }],
  scenario_vocab: { fog_density: { fog: '50' } },
  examples: { source: 'docs/examples/R_baseline.dsl', goal: 'Pedestrian Safety' },
  suggestions: {
    goal: ['Pedestrian Safety'],
    scenario: ['A pedestrian trying to cross the street in fog.'],
    free_assumption: ['daylight, dry road'],
    free_soft_goal: ['braking is smooth unless an emergency stop is needed'],
    perception: {
      sub_goal: ['Pedestrian Check'],
      agent: ['Perception Module'],
      input: ['image'],
      output: ['pedestrian detection flag'],
      condition: [],
      task: [],
    },
    braking: {
      sub_goal: ['braking'],
      agent: ['braking module'],
      input: [],
      output: ['Braking Status Flag'],
      condition: [],
      task: ['Bring down throttle'],
    },
  },
  not_covered: ['"parallely" between sub-goals'],
};

const TREE = {
  temporal: 'MAINTAIN',
  objective: 'Pedestrian Safety',
  refinement: {
    combinator: 'followed by',
    goals: [
      {
        objective: 'Pedestrian Check',
        agent: 'Perception Module',
        operations: [
          {
            task: 'Detect Pedestrian',
            tasks: ['Detect Pedestrian'],
            condition: null,
            module: 'yolov5s',
            inputs: ['image'],
            outputs: ['flag'],
          },
        ],
      },
      {
        objective: 'braking',
        agent: 'braking module',
        operations: [
          {
            task: 'Apply Brakes',
            tasks: ['Apply Brakes'],
            condition: null,
            module: 'emergency_braking',
            inputs: ['flag'],
            outputs: ['status'],
          },
        ],
      },
    ],
  },
  scenario: 'A pedestrian trying to cross the street in fog.',
  assumptions: [],
  soft_goals: [],
};

let checkOk = false;
const submitted: { text: string; name: string }[] = [];

beforeEach(() => {
  checkOk = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
      if (String(url).endsWith('/authoring/catalog')) return json(CATALOG);
      if (String(url).endsWith('/authoring/lists')) return json({ lists: [] });
      if (String(url).endsWith('/authoring/run/check-laptop'))
        return json({
          ok: true,
          kind: null,
          checked: 32,
          how: 'all 32 scenarios',
          system_under_test: { braking_mode: 'emergency_braking', yolo_model: 'yolov5s' },
          failures: [],
          message: null,
        });
      if (String(url).endsWith('/authoring/run/check-cluster'))
        return json({ ok: true, host: 'h' });
      if (String(url).endsWith('/authoring/match'))
        return json({ ok: true, searched: 0, matches: [] });
      if (String(url).endsWith('/authoring/run')) {
        submitted.push(JSON.parse(String(init?.body ?? '{}')));
        return json({
          job_id: '4999001',
          requirement: 'requirements/R_new.dsl',
          submitted_at: '2026-10-09T10:00:00Z',
          state: 'PENDING',
          progress: null,
          run_id: null,
          fetched: false,
          message: null,
        });
      }
      return json(
        checkOk
          ? {
              ok: true,
              tree: TREE,
              covered: null,
              assumptions: [],
              soft_goals: [],
              scenario_constraints: {},
              modules: {
                perception: {
                  module: 'yolov5s',
                  task: 'Detect Pedestrian',
                  runs: true,
                  default: 'yolov5s',
                },
                braking: {
                  module: 'emergency_braking',
                  task: 'Apply Brakes',
                  runs: true,
                  default: 'x',
                },
              },
            }
          : { ok: false, error: { message: 'Unexpected token', line: 2, column: 9 } },
      );
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

function renderPage() {
  return render(
    <WorkspaceProvider autoOpenExample={false}>
      <AuthorPage />
    </WorkspaceProvider>,
  );
}

describe('AuthorPage: the requirement as text with gaps', () => {
  it('starts from the skeleton: the fixed words, the key tasks, the default modules', async () => {
    renderPage();
    const editor = await screen.findByRole('group', { name: 'Requirement, with gaps to fill' });
    expect(editor).toHaveTextContent('operationalized as');
    expect(editor).toHaveTextContent('"Detect Pedestrian"');
    expect(editor).toHaveTextContent('performed by');
    expect(editor).toHaveTextContent('"Apply Brakes"');
    expect((within(editor).getByLabelText('sub-goal 1 module') as HTMLSelectElement).value).toBe(
      'yolov5s',
    );
    expect((within(editor).getByLabelText('sub-goal 2 module') as HTMLSelectElement).value).toBe(
      'emergency_braking',
    );
  });

  it('offers only the modules the executor runs in the bounded gaps', async () => {
    renderPage();
    const select = (await screen.findByLabelText('sub-goal 1 module')) as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(['yolov5m', 'yolov5s']);
  });

  it('suggests wording from the example requirements, and the perception outputs as braking input', async () => {
    renderPage();
    const goal = (await screen.findByLabelText('goal name')) as HTMLInputElement;
    const goalList = document.getElementById(goal.getAttribute('list')!)!;
    expect([...goalList.querySelectorAll('option')].map((o) => o.value)).toContain(
      'Pedestrian Safety',
    );
    fireEvent.change(screen.getByLabelText('sub-goal 1 output 1'), {
      target: { value: 'pedestrian detection flag' },
    });
    const input = screen.getByLabelText('sub-goal 2 input 1') as HTMLInputElement;
    const inputList = document.getElementById(input.getAttribute('list')!)!;
    expect([...inputList.querySelectorAll('option')].map((o) => o.value)).toContain(
      'pedestrian detection flag',
    );
  });

  it('marks a free-text assumption as not checked the moment it is added', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'add a free-text assuming item' }));
    expect(screen.getByTitle('not checked automatically')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'add a measurable assuming item' }));
    const quantity = screen.getByLabelText('assuming 2 quantity') as HTMLSelectElement;
    expect([...quantity.options].find((o) => o.value === 'lane_width_m')?.disabled).toBe(true);
  });

  it('keeps Save disabled while the parser rejects the text, and marks the line', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('line 2'), {
      timeout: 3000,
    });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('draws the goal model live, and keeps the last good one dimmed when the text breaks', async () => {
    checkOk = true;
    renderPage();
    const preview = await screen.findByRole('region', { name: 'Goal model preview' });
    await waitFor(
      () =>
        expect(within(preview).getByRole('img', { name: /KAOS goal model/ })).toBeInTheDocument(),
      {
        timeout: 3000,
      },
    );
    checkOk = false;
    fireEvent.change(screen.getByLabelText('goal name'), { target: { value: 'G2' } });
    await waitFor(
      () => expect(within(preview).getByText(/last version that parsed/)).toBeInTheDocument(),
      {
        timeout: 3000,
      },
    );
    expect(within(preview).getByRole('img', { name: /KAOS goal model/ })).toBeInTheDocument();
  });
});

describe('Run test', () => {
  it('asks before running a new requirement on the cluster, then follows the job', async () => {
    checkOk = true;
    renderPage();
    await screen.findByRole('button', { name: /Run test/ });
    const fill: [string, string][] = [
      ['goal name', 'G'],
      ['sub-goal 1 name', 'S1'],
      ['sub-goal 1 agent', 'A1'],
      ['sub-goal 1 input 1', 'i'],
      ['sub-goal 1 output 1', 'o'],
      ['sub-goal 2 name', 'S2'],
      ['sub-goal 2 agent', 'A2'],
      ['sub-goal 2 input 1', 'o'],
      ['sub-goal 2 output 1', 'b'],
      ['scenario', 's'],
    ];
    for (const [label, value] of fill)
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    await waitFor(
      () => expect(screen.getByRole('button', { name: /Run test/ })).not.toBeDisabled(),
      { timeout: 3000 },
    );
    fireEvent.click(screen.getByRole('button', { name: /Run test/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Run test' });
    // 1. choose: no results yet, no scenario list -> the full test
    await waitFor(() =>
      expect(within(dialog).getByRole('radio', { name: /Full test/ })).toBeChecked(),
    );
    fireEvent.click(within(dialog).getByRole('button', { name: /Check and run/ }));
    // 2. check: every check ticks, then Submit appears; nothing was sent before
    await waitFor(() =>
      expect(
        within(dialog).getByRole('button', { name: 'Submit to the cluster' }),
      ).toBeInTheDocument(),
    );
    expect(within(dialog).getByText(/emergency_braking · yolov5s/)).toBeInTheDocument();
    expect(submitted).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit to the cluster' }));
    // 3. run: the timeline, and the toolbar button follows the job
    await waitFor(() =>
      expect(within(dialog).getByText('Waiting in the queue')).toBeInTheDocument(),
    );
    expect(dialog).toHaveTextContent('4999001');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Test queued' })).toBeInTheDocument();
    expect(submitted[0]?.name).toBe('R_new.dsl');
    // the job script's defaults unless the reviewer changed an option
    expect((submitted[0] as unknown as { options: unknown }).options).toEqual({ search: 'grid' });
  });
});

describe('the template, before the parser', () => {
  it('names empty gaps and stray quotes, and renders the baseline layout', () => {
    const form = emptyForm(CATALOG);
    expect(formProblems(form, CATALOG)).toContain('Goal name is empty');
    form.objective = 'Pedestrian "Safety"';
    expect(formProblems(form, CATALOG)).toContain('Goal name contains a double quote');
    const text = toDsl({ ...form, objective: 'G', assumptions: [], softGoals: [] });
    expect(text).toMatch(/^MAINTAIN "G"\n {4}by\n/);
    expect(text).toContain('    followed by\n');
    expect(text).not.toContain('assuming');
  });
});
