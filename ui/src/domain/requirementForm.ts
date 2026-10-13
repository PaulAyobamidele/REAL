import type {
  AuthoringCatalog,
  CheckResult,
  ClassifiedItem,
  GoalTreeJson,
} from '@/services/authoring';

/**
 * The requirement form's state and its one-way rendering to DSL text.
 *
 * This module never parses DSL. Text -> form goes through the project's
 * parser (the authoring helper returns the goal tree and every assumption
 * and soft goal already classified); form -> text is plain rendering in the
 * layout of docs/examples/R_baseline.dsl, and the result is sent back to the
 * same parser before anything is saved. One source of truth for the grammar.
 *
 * The form holds exactly what the executor and the analysis read: one
 * operation per sub-goal, each in a role the executor runs (perception: the
 * module on "Detect Pedestrian"; braking: the module on "Apply Brakes"),
 * sub-goals joined by "followed by". Anything else stays in raw-text mode.
 */

export type Role = 'perception' | 'braking';

export type ClauseItem =
  { mode: 'checked'; quantity: string; op: string; value: string } | { mode: 'free'; text: string };

export interface OperationForm {
  role: Role;
  /** All tasks in order; the role's key task is one of them and cannot be removed. */
  tasks: string[];
  condition: string;
  module: string;
  inputs: string[];
  outputs: string[];
}

export interface SubGoalForm {
  objective: string;
  agent: string;
  operation: OperationForm;
}

export interface RequirementForm {
  temporal: string;
  objective: string;
  subgoals: SubGoalForm[];
  scenario: string;
  assumptions: ClauseItem[];
  softGoals: ClauseItem[];
}

export function keyTask(role: Role, catalog: AuthoringCatalog): string {
  return catalog.roles[role].task;
}

export function emptyOperation(role: Role, catalog: AuthoringCatalog): OperationForm {
  const r = catalog.roles[role];
  return {
    role,
    tasks: [r.task],
    condition: '',
    module: r.modules.includes(r.default ?? '') ? (r.default as string) : (r.modules[0] ?? ''),
    inputs: [''],
    outputs: [''],
  };
}

/** A blank form: a perception sub-goal followed by a braking sub-goal, as the executor runs them. */
export function emptyForm(catalog: AuthoringCatalog): RequirementForm {
  return {
    temporal: catalog.temporal_ops.includes('MAINTAIN')
      ? 'MAINTAIN'
      : (catalog.temporal_ops[0] ?? ''),
    objective: '',
    subgoals: [
      { objective: '', agent: '', operation: emptyOperation('perception', catalog) },
      { objective: '', agent: '', operation: emptyOperation('braking', catalog) },
    ],
    scenario: '',
    assumptions: [],
    softGoals: [],
  };
}

export function itemText(item: ClauseItem): string {
  return item.mode === 'checked' ? `${item.quantity} ${item.op} ${item.value}` : item.text;
}

const q = (s: string) => `"${s}"`;
const join = (xs: string[]) => xs.map(q).join(' & ');

/** The DSL text for a form, in the layout of docs/examples/R_baseline.dsl. */
export function toDsl(form: RequirementForm): string {
  const lines = [`${form.temporal} ${q(form.objective)}`, '    by'];
  form.subgoals.forEach((sg, i) => {
    if (i > 0) lines.push('    followed by');
    const op = sg.operation;
    lines.push(
      `        ${q(sg.objective)} using ${q(sg.agent)}`,
      '            operationalized as',
      `                ${join(op.tasks)}${op.condition.trim() ? ` if ${q(op.condition)}` : ''} performed by ${q(op.module)}`,
      `                taking input ${join(op.inputs)} producing output ${join(op.outputs)}`,
    );
  });
  lines.push('    in scenario where', `        ${q(form.scenario)}`);
  if (form.assumptions.length) lines.push(`    assuming ${join(form.assumptions.map(itemText))}`);
  if (form.softGoals.length) lines.push(`    ensuring ${join(form.softGoals.map(itemText))}`);
  return lines.join('\n') + '\n';
}

/** Problems the form can see without the parser: empty required fields and stray quotes. */
export function formProblems(form: RequirementForm, catalog: AuthoringCatalog): string[] {
  const problems: string[] = [];
  const need = (value: string, what: string) => {
    if (!value.trim()) problems.push(`${what} is empty`);
    else if (value.includes('"')) problems.push(`${what} contains a double quote`);
  };
  need(form.objective, 'Goal name');
  form.subgoals.forEach((sg, i) => {
    const at = `sub-goal ${i + 1}`;
    need(sg.objective, `The name of ${at}`);
    need(sg.agent, `The agent of ${at}`);
    sg.operation.tasks.forEach((t, k) => need(t, `Task ${k + 1} of ${at}`));
    if (sg.operation.condition.includes('"'))
      problems.push(`The condition of ${at} contains a double quote`);
    if (!sg.operation.module) problems.push(`No module chosen for ${at}`);
    sg.operation.inputs.forEach((t, k) => need(t, `Input ${k + 1} of ${at}`));
    sg.operation.outputs.forEach((t, k) => need(t, `Output ${k + 1} of ${at}`));
    if (!sg.operation.tasks.includes(keyTask(sg.operation.role, catalog)))
      problems.push(`${at} lacks the task "${keyTask(sg.operation.role, catalog)}"`);
  });
  for (const role of ['perception', 'braking'] as const) {
    const n = form.subgoals.filter((sg) => sg.operation.role === role).length;
    if (n > 1) problems.push(`${n} ${role} sub-goals: the executor runs only the first`);
  }
  need(form.scenario, 'The scenario description');
  const items = [
    ...form.assumptions.map((a, k) => ['Assumption', a, k] as const),
    ...form.softGoals.map((a, k) => ['Soft goal', a, k] as const),
  ];
  for (const [what, item, k] of items) {
    if (item.mode === 'free') need(item.text, `${what} ${k + 1}`);
    else if (!item.quantity || !item.op || !item.value.trim())
      problems.push(`${what} ${k + 1} needs a quantity, an operator and a value`);
  }
  return problems;
}

/**
 * The form for a requirement the parser has read, or why the form cannot
 * hold it exactly. Assumptions and soft goals come back as the analysis
 * classified them: a checked one as quantity / operator / value, anything
 * else as free text (a rejected one too - the live check keeps flagging it).
 */
export function fromCheck(
  result: Extract<CheckResult, { ok: true }>,
  catalog: AuthoringCatalog,
): { form: RequirementForm } | { reason: string } {
  if (result.covered) return { reason: result.covered };
  const tree: GoalTreeJson = result.tree;
  const goals = tree.refinement?.goals ?? [];
  const subgoals: SubGoalForm[] = [];
  for (const g of goals) {
    const ops = g.operations ?? [];
    if (ops.length !== 1)
      return {
        reason: `sub-goal "${g.objective}" has ${ops.length} operations; the form holds one`,
      };
    const op = ops[0]!;
    const tasks = op.tasks ?? [];
    const role: Role | null = tasks.includes(catalog.roles.perception.task)
      ? 'perception'
      : tasks.includes(catalog.roles.braking.task) || tasks.includes('Brake')
        ? 'braking'
        : null;
    if (!role)
      return {
        reason: `operation "${tasks.join(' & ')}" is neither perception ("${catalog.roles.perception.task}") nor braking ("${catalog.roles.braking.task}"), so the executor never runs its module`,
      };
    subgoals.push({
      objective: g.objective ?? '',
      agent: g.agent ?? '',
      operation: {
        role,
        tasks,
        condition: op.condition ?? '',
        module: op.module ?? '',
        inputs: op.inputs ?? [],
        outputs: op.outputs ?? [],
      },
    });
  }
  const softNames = new Set(catalog.soft_goal_quantities.map((s) => s.name));
  const assumptionNames = new Set(catalog.assumption_quantities.map((a) => a.name));
  const asItem = (c: ClassifiedItem, known: Set<string>, checkedKinds: string[]): ClauseItem =>
    checkedKinds.includes(c.kind) && c.quantity && c.op && known.has(c.quantity)
      ? { mode: 'checked', quantity: c.quantity, op: c.op, value: String(c.value) }
      : { mode: 'free', text: c.text };
  return {
    form: {
      temporal: tree.temporal ?? '',
      objective: tree.objective ?? '',
      subgoals,
      scenario: tree.scenario ?? '',
      assumptions: result.assumptions.map((a) => asItem(a, assumptionNames, ['scenario', 'run'])),
      softGoals: result.soft_goals.map((s) => asItem(s, softNames, ['checked'])),
    },
  };
}

/** For comparing requirement texts: comments dropped, whitespace collapsed. */
export function normaliseDsl(text: string): string {
  return text
    .split('\n')
    .map((l) => l.replace(/#.*$/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
