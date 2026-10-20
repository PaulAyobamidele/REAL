import {
  snippet,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import {
  HighlightStyle,
  StreamLanguage,
  StringStream,
  type StreamParser,
} from '@codemirror/language';
import { hoverTooltip, type EditorView, type Tooltip } from '@codemirror/view';
import { Tag, tags } from '@lezer/highlight';

import type { AuthoringCatalog } from '@/services/authoring';

/**
 * REAL-DSL in the editor: the tokens of the project's grammar
 * (scripts/redsl/grammar.py), the clause every quoted string belongs to,
 * completion that offers only what the grammar allows next, and hover notes.
 * Nothing here decides whether a text parses: that stays the project's parser.
 */

// ------------------------------------------------------------------ clauses

/** What a quoted string is, read from the keyword before it. */
export type Clause =
  | 'start'
  | 'goal'
  | 'subgoal'
  | 'agent'
  | 'task'
  | 'condition'
  | 'module'
  | 'input'
  | 'output'
  | 'scenario'
  | 'assuming'
  | 'ensuring';

/** Every keyword, longest first, with the clause of the string that follows it. */
const KEYWORDS: { re: RegExp; word: string; clause: Clause }[] = [
  { re: /^operationalized\s+as\b/, word: 'operationalized as', clause: 'task' },
  { re: /^in\s+scenario\s+where\b/, word: 'in scenario where', clause: 'scenario' },
  { re: /^taking\s+input\b/, word: 'taking input', clause: 'input' },
  { re: /^producing\s+output\b/, word: 'producing output', clause: 'output' },
  { re: /^performed\s+by\b/, word: 'performed by', clause: 'module' },
  { re: /^followed\s+by\b/, word: 'followed by', clause: 'subgoal' },
  { re: /^parallely\b/, word: 'parallely', clause: 'subgoal' },
  { re: /^triggering\b/, word: 'triggering', clause: 'task' },
  { re: /^assuming\b/, word: 'assuming', clause: 'assuming' },
  { re: /^ensuring\b/, word: 'ensuring', clause: 'ensuring' },
  { re: /^using\b/, word: 'using', clause: 'agent' },
  { re: /^by\b/, word: 'by', clause: 'subgoal' },
  { re: /^if\b/, word: 'if', clause: 'condition' },
  { re: /^(MAINTAIN|ACHIEVE)\b/, word: 'MAINTAIN', clause: 'goal' },
];

/** What may come after a closed string of each clause (the grammar's order). */
export const NEXT: Record<Clause, string[]> = {
  start: ['MAINTAIN', 'ACHIEVE'],
  goal: ['by'],
  subgoal: ['using'],
  agent: ['operationalized as', 'followed by', 'parallely', 'in scenario where'],
  task: ['if', 'performed by', '&'],
  condition: ['performed by', '&', '|'],
  module: ['taking input'],
  input: ['producing output', '&'],
  output: ['followed by', 'parallely', 'triggering', 'in scenario where', '&'],
  scenario: ['assuming', 'ensuring'],
  assuming: ['ensuring', '&'],
  ensuring: ['&'],
};

/** One line on each keyword, for completion and hover (docs/manual/real-dsl.md has the rest). */
export const KEYWORD_DOCS: Record<string, string> = {
  MAINTAIN: 'The goal must hold at every moment of the scenario.',
  ACHIEVE: 'The goal must be reached at some moment of the scenario.',
  by: 'The first sub-goal that refines the goal.',
  using: 'The component (agent) responsible for the sub-goal.',
  'operationalized as': 'The task the component performs to meet its sub-goal.',
  if: 'The condition under which the task runs.',
  'performed by': 'The module that performs the task. It must be one the simulator implements.',
  'taking input': 'What the task reads.',
  'producing output': 'What the task writes.',
  'followed by': 'The next sub-goal, after the one before.',
  parallely: 'A sub-goal that runs alongside the one before.',
  triggering: 'An operation started by the one before.',
  'in scenario where': 'The situation the requirement is about, in words.',
  assuming:
    'Domain assumptions: what must be true of the world. A failure counts against the system only when they held.',
  ensuring: 'Soft goals: qualities promised beyond safety.',
  '&': 'And: one more item of the same kind.',
  '|': 'Or, between conditions.',
};

interface State {
  clause: Clause;
  inString: boolean;
  /** the last thing seen outside a string: a keyword (a string is due) or a closed string */
  after: 'keyword' | 'string' | 'nothing';
}

const STRING_TOKEN: Partial<Record<Clause, string>> = {
  module: 'module',
  assuming: 'assumption',
  ensuring: 'softGoal',
};

export const dslTags = {
  temporal: Tag.define(tags.keyword),
  module: Tag.define(tags.string),
  assumption: Tag.define(tags.string),
  softGoal: Tag.define(tags.string),
  quantity: Tag.define(tags.propertyName),
};

function parser(quantities: ReadonlySet<string>): StreamParser<State> {
  return {
    name: 'real-dsl',
    startState: () => ({ clause: 'start', inString: false, after: 'nothing' }),
    copyState: (s) => ({ ...s }),
    token(stream, state) {
      if (stream.sol() && state.inString) state.inString = false; // a string ends with its line
      const str = STRING_TOKEN[state.clause] ?? 'string';
      if (state.inString) {
        if (stream.eat('"')) {
          state.inString = false;
          state.after = 'string';
          return str;
        }
        // inside an assumption or a soft goal, the measurable parts stand out
        if (state.clause === 'assuming' || state.clause === 'ensuring') {
          // two names: the part's own colour on the string's chip, one block from quote to quote
          if (stream.match(/^(<=|>=|==|!=|<|>)/)) return `${str} operator`;
          if (stream.match(/^-?\d+(\.\d+)?/)) return `${str} number`;
          const word = stream.match(/^[A-Za-z_]\w*/) as RegExpMatchArray | null;
          // a quantity only where it is measured: followed by a comparison
          if (word)
            return quantities.has(word[0]) && stream.match(/^\s*(<=|>=|==|!=|<|>)/, false)
              ? `${str} quantity`
              : str;
          stream.next();
          return str;
        }
        if (!stream.skipTo('"')) stream.skipToEnd();
        return str;
      }
      if (stream.eatSpace()) return null;
      if (stream.match(/^#.*/)) return 'comment';
      if (stream.eat('"')) {
        state.inString = true;
        return str;
      }
      if (stream.match(/^[&|]/)) {
        state.after = 'keyword';
        return 'operator';
      }
      for (const k of KEYWORDS) {
        if (stream.match(k.re)) {
          state.clause = k.clause;
          state.after = 'keyword';
          return k.clause === 'goal' ? 'temporal' : 'keyword';
        }
      }
      if (!stream.match(/^[^\s"#&|]+/)) stream.next();
      return 'invalid'; // a word the grammar does not know: a misspelled keyword
    },
    tokenTable: {
      temporal: dslTags.temporal,
      module: dslTags.module,
      assumption: dslTags.assumption,
      softGoal: dslTags.softGoal,
      quantity: dslTags.quantity,
    },
    languageData: { commentTokens: { line: '#' } },
  };
}

/** The clause and position of the text up to the cursor (the same rules as the colours). */
export function contextOf(text: string, quantities: ReadonlySet<string> = new Set()): State {
  const p = parser(quantities);
  const state = p.startState!(2);
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const stream = new StringStream(line, 4, 2);
    if (i > 0 && state.inString) state.inString = false;
    while (!stream.eol()) {
      const before = stream.pos;
      p.token(stream, state);
      if (stream.pos === before) stream.next();
      stream.start = stream.pos;
    }
  });
  return state;
}

export function realDsl(catalog: AuthoringCatalog) {
  const quantities = new Set([
    ...catalog.assumption_quantities.map((q) => q.name),
    ...catalog.soft_goal_quantities.map((q) => q.name),
  ]);
  return {
    language: StreamLanguage.define(parser(quantities)),
    complete: completionSource(catalog, quantities),
    hover: hover(catalog),
  };
}

// ------------------------------------------------------------------ colours

/** Light and dark: the strings take the colour of their shape in the goal model. */
export const DSL_COLOURS = {
  light: {
    background: '#ffffff',
    text: '#1f2328',
    gutter: '#f6f7f9',
    gutterText: '#5f6873',
    activeLine: '#f3f6fa',
    selection: '#cfe3ff',
    keyword: '#8f2a7a',
    temporal: '#0b6b62',
    string: '#7a4300',
    module: '#6b5300',
    moduleBg: '#fbf3c8',
    assumption: '#5b3f99',
    assumptionBg: '#efe8fa',
    softGoal: '#1a5aa8',
    softGoalBg: '#e5effb',
    number: '#9a4700',
    comment: '#6e7781',
    invalid: '#b42318',
  },
  dark: {
    background: '#1b1d23',
    text: '#d6dae0',
    gutter: '#1b1d23',
    gutterText: '#7d8590',
    activeLine: '#242731',
    selection: '#2f4a73',
    keyword: '#e39ad4',
    temporal: '#5fd4c4',
    string: '#e6b673',
    module: '#f0d275',
    moduleBg: '#3a3320',
    assumption: '#c9b2f7',
    assumptionBg: '#30283f',
    softGoal: '#8cc2ff',
    softGoalBg: '#1f3047',
    number: '#f3a76a',
    comment: '#8b949e',
    invalid: '#ff8f85',
  },
} as const;

export function dslHighlight(mode: 'light' | 'dark') {
  const c = DSL_COLOURS[mode];
  const chip = (bg: string) => ({ backgroundColor: bg });
  return HighlightStyle.define([
    { tag: tags.keyword, color: c.keyword, fontWeight: '600' },
    { tag: dslTags.temporal, color: c.temporal, fontWeight: '700' },
    { tag: tags.string, color: c.string },
    { tag: dslTags.module, color: c.module, ...chip(c.moduleBg) },
    { tag: dslTags.assumption, color: c.assumption, ...chip(c.assumptionBg) },
    { tag: dslTags.softGoal, color: c.softGoal, ...chip(c.softGoalBg) },
    { tag: dslTags.quantity, fontWeight: '700' },
    { tag: tags.operator, color: c.keyword, fontWeight: '600' },
    { tag: tags.number, color: c.number },
    { tag: tags.comment, color: c.comment, fontStyle: 'italic' },
    {
      tag: tags.invalid,
      color: c.invalid,
      textDecoration: `underline wavy ${c.invalid}`,
      textUnderlineOffset: '3px',
    },
  ]);
}

// ------------------------------------------------------------------ completion

const SKELETON = [
  '${MAINTAIN} "${goal}"',
  '    by "${sub-goal}" using "${component}"',
  '        operationalized as "${task}" performed by "${module}"',
  '        taking input "${input}" producing output "${output}"',
  '    in scenario where "${situation}"',
  '    assuming "${assumption}"',
  '    ensuring "${soft goal}"',
].join('\n');

/** Insert a keyword with its empty string, cursor inside, and offer what fits there. */
function keywordApply(word: string) {
  const insert = snippet(`${word} "\${}"`); // every keyword is followed by a string
  return (view: EditorView, c: Completion, from: number, to: number) => {
    insert(view, c, from, to);
    window.setTimeout(() => startCompletion(view), 0);
  };
}

function completionSource(catalog: AuthoringCatalog, quantities: ReadonlySet<string>) {
  const s = catalog.suggestions;
  const unique = (xs: (string | null | undefined)[]) =>
    [...new Set(xs.filter(Boolean))] as string[];
  const phrases: Partial<Record<Clause, Completion[]>> = {
    goal: unique([...(s?.goal ?? []), catalog.examples.goal]).map((t) => ({
      label: t,
      type: 'text',
      detail: 'goal',
    })),
    subgoal: unique([...(s?.perception.sub_goal ?? []), ...(s?.braking.sub_goal ?? [])]).map(
      (t) => ({ label: t, type: 'text', detail: 'sub-goal' }),
    ),
    agent: unique([...(s?.perception.agent ?? []), ...(s?.braking.agent ?? [])]).map((t) => ({
      label: t,
      type: 'text',
      detail: 'component',
    })),
    task: unique([
      catalog.roles.perception.task,
      catalog.roles.braking.task,
      ...(s?.perception.task ?? []),
      ...(s?.braking.task ?? []),
    ]).map((t) => ({ label: t, type: 'function', detail: 'task' })),
    condition: unique([...(s?.perception.condition ?? []), ...(s?.braking.condition ?? [])]).map(
      (t) => ({ label: t, type: 'text', detail: 'condition' }),
    ),
    input: unique([...(s?.perception.input ?? []), ...(s?.braking.input ?? [])]).map((t) => ({
      label: t,
      type: 'variable',
      detail: 'input',
    })),
    output: unique([...(s?.perception.output ?? []), ...(s?.braking.output ?? [])]).map((t) => ({
      label: t,
      type: 'variable',
      detail: 'output',
    })),
    scenario: unique(s?.scenario ?? []).map((t) => ({
      label: t,
      type: 'text',
      detail: 'scenario',
    })),
    module: (['perception', 'braking'] as const).flatMap((role) =>
      catalog.roles[role].modules.map((m) => ({
        label: m,
        type: 'class',
        detail: role === 'perception' ? 'detector' : 'braking',
        info: `Implemented by the simulator${catalog.roles[role].default === m ? ' (the default)' : ''}.`,
        boost: catalog.roles[role].default === m ? 1 : 0,
      })),
    ),
  };
  const measurable: Record<'assuming' | 'ensuring', Completion[]> = {
    assuming: [
      ...catalog.assumption_quantities
        .filter((q) => q.available)
        .map((q) => ({
          label: q.name,
          type: 'property',
          detail: q.unit ? `${q.unit} · checked` : 'checked',
          info:
            q.level === 'run'
              ? 'Measured on every run, then checked.'
              : 'A scenario setting, checked before the run.',
          boost: 2,
        })),
      ...unique(s?.free_assumption ?? []).map((t) => ({
        label: t,
        type: 'text',
        detail: 'not checked',
        info: 'Free text: recorded, never checked by the tool.',
      })),
    ],
    ensuring: [
      ...catalog.soft_goal_quantities.map((q) => ({
        label: q.name,
        type: 'property',
        detail: 'checked',
        info: q.meaning,
        boost: 2,
      })),
      ...unique(s?.free_soft_goal ?? []).map((t) => ({
        label: t,
        type: 'text',
        detail: 'not checked',
        info: 'Free text: recorded, never checked by the tool.',
      })),
    ],
  };
  const operators = catalog.operators.map((op) => ({
    label: op,
    type: 'keyword',
    detail: 'compare',
  }));

  return (ctx: CompletionContext): CompletionResult | null => {
    const before = ctx.state.sliceDoc(0, ctx.pos);
    const state = contextOf(before, quantities);
    if (state.inString) {
      if (state.clause === 'assuming' || state.clause === 'ensuring') {
        const inside = before.slice(before.lastIndexOf('"') + 1);
        // after "<quantity> ": the comparison
        if (
          /^\s*[A-Za-z_]\w*\s+[<>=!]*$/.test(inside) &&
          quantities.has(inside.trim().split(/\s+/)[0]!)
        ) {
          const op = ctx.matchBefore(/[<>=!]*/);
          return { from: op?.from ?? ctx.pos, options: operators, validFor: /^[<>=!]*$/ };
        }
        if (/^\s*[A-Za-z_]\w*\s*(<=|>=|==|!=|<|>)\s*\S*$/.test(inside)) return null; // a number is due
        const word = ctx.matchBefore(/[^"]*/);
        return {
          from: word?.from ?? ctx.pos,
          options: measurable[state.clause],
          validFor: /^[^"]*$/,
        };
      }
      const options = phrases[state.clause];
      if (!options?.length) return null;
      const word = ctx.matchBefore(/[^"]*/);
      return { from: word?.from ?? ctx.pos, options, validFor: /^[^"]*$/ };
    }
    // outside a string: a keyword, but only after a closed string (or at the start)
    if (state.after === 'keyword') return null; // a string is due: it starts with "
    const word = ctx.matchBefore(/[A-Za-z&|]+/);
    if (!word && !ctx.explicit) return null;
    const next = NEXT[state.clause];
    const options: Completion[] = next.map((k) => ({
      label: k,
      type: 'keyword',
      info: KEYWORD_DOCS[k],
      apply: keywordApply(k),
    }));
    if (state.clause === 'start')
      options.unshift({
        label: 'requirement',
        displayLabel: 'New requirement (skeleton)',
        type: 'keyword',
        detail: 'template',
        info: 'A whole requirement with every part to fill. Tab moves to the next part.',
        apply: snippet(SKELETON),
        boost: 5,
      });
    return { from: word?.from ?? ctx.pos, options, validFor: /^[A-Za-z]*$/ };
  };
}

// ------------------------------------------------------------------ hover

function hover(catalog: AuthoringCatalog) {
  const notes = new Map<string, string>();
  for (const q of catalog.assumption_quantities)
    notes.set(
      q.name,
      `${q.name}${q.unit ? ` (${q.unit})` : ''}: ${q.level === 'run' ? 'measured on every run' : 'a scenario setting'}, checked by the tool.`,
    );
  for (const q of catalog.soft_goal_quantities) notes.set(q.name, `${q.name}: ${q.meaning}.`);
  for (const role of ['perception', 'braking'] as const)
    for (const m of catalog.roles[role].modules)
      notes.set(
        m,
        `${m}: a ${role === 'perception' ? 'detector' : 'braking'} module the simulator implements${catalog.roles[role].default === m ? ' (the default)' : ''}.`,
      );
  for (const k of Object.keys(KEYWORD_DOCS))
    if (/^\w+$/.test(k)) notes.set(k, `${k}: ${KEYWORD_DOCS[k]}`);
  const multi = KEYWORDS.filter((k) => k.word.includes(' '));

  return hoverTooltip((view, pos): Tooltip | null => {
    const line = view.state.doc.lineAt(pos);
    const at = pos - line.from;
    for (const k of multi) {
      const re = new RegExp(k.re.source.slice(1), 'g');
      for (const m of line.text.matchAll(re))
        if (at >= m.index! && at <= m.index! + m[0].length)
          return note(
            line.from + m.index!,
            line.from + m.index! + m[0].length,
            `${k.word}: ${KEYWORD_DOCS[k.word]}`,
          );
    }
    let start = at;
    let end = at;
    while (start > 0 && /\w/.test(line.text[start - 1]!)) start--;
    while (end < line.text.length && /\w/.test(line.text[end]!)) end++;
    const word = line.text.slice(start, end);
    const text = notes.get(word);
    return text ? note(line.from + start, line.from + end, text) : null;
  });

  function note(from: number, to: number, text: string): Tooltip {
    return {
      pos: from,
      end: to,
      above: true,
      create: () => {
        const dom = document.createElement('div');
        dom.className = 'cm-dsl-hover';
        dom.textContent = text;
        return { dom };
      },
    };
  }
}

// ------------------------------------------------------------------ text -> goal model

/**
 * The goal-model boxes drawn from the part of the text at `pos`, as id
 * prefixes of the layout (domain/kaosLayout.ts: goal, sub.i, op.i.k,
 * agent.i.k, domain.j, soft.j). A string maps to its own box, counted in the
 * order the layout counts them; a keyword to the boxes it introduces
 * ("assuming": every domain property). Null outside anything drawn.
 */
export function targetAt(text: string, pos: number): string[] | null {
  const p = parser(new Set());
  const state = p.startState!(2);
  const n = { sub: -1, op: -1, dom: -1, soft: -1 };
  let offset = 0;
  for (const line of text.split('\n')) {
    if (pos < offset) break;
    const stream = new StringStream(line, 4, 2);
    if (state.inString) state.inString = false;
    while (!stream.eol()) {
      stream.start = stream.pos;
      const token = p.token(stream, state);
      if (stream.pos === stream.start) {
        stream.next();
        continue;
      }
      const word = stream.current();
      if (token === 'keyword' || token === 'temporal') {
        if (state.clause === 'subgoal') {
          n.sub++;
          n.op = -1;
        } else if (state.clause === 'task') n.op++;
        else if (state.clause === 'assuming') n.dom++;
        else if (state.clause === 'ensuring') n.soft++;
      } else if (token === 'operator' && word === '&') {
        if (state.clause === 'assuming') n.dom++;
        else if (state.clause === 'ensuring') n.soft++;
      }
      const from = offset + stream.start;
      if (pos >= from && pos < offset + stream.pos) {
        if (!token || token === 'comment' || token === 'invalid') return null;
        if (token === 'keyword' && word === 'assuming') return ['domain'];
        if (token === 'keyword' && word === 'ensuring') return ['soft'];
        return boxesOf(state.clause, n);
      }
    }
    offset += line.length + 1;
  }
  return null;
}

function boxesOf(
  clause: Clause,
  n: { sub: number; op: number; dom: number; soft: number },
): string[] | null {
  switch (clause) {
    case 'goal':
    case 'scenario':
      return ['goal'];
    case 'subgoal':
      return [`sub.${n.sub}`];
    case 'agent':
      return [`sub.${n.sub}`, `agent.${n.sub}`];
    case 'task':
    case 'condition':
    case 'input':
    case 'output':
      return [`op.${n.sub}.${Math.max(n.op, 0)}`];
    case 'module':
      return [`agent.${n.sub}.${Math.max(n.op, 0)}`];
    case 'assuming':
      return [`domain.${Math.max(n.dom, 0)}`];
    case 'ensuring':
      return [`soft.${Math.max(n.soft, 0)}`];
    default:
      return null;
  }
}

/** No catalog (a review shows the requirement read only, without the helper): colours, no suggestions. */
export const NO_CATALOG: AuthoringCatalog = {
  temporal_ops: ['ACHIEVE', 'MAINTAIN'],
  operators: ['<=', '>=', '==', '!=', '<', '>'],
  roles: {
    perception: { task: 'Detect Pedestrian', modules: [], default: null, source: '' },
    braking: { task: 'Apply Brakes', modules: [], default: null, source: '' },
  },
  assumption_quantities: [],
  soft_goal_quantities: [],
  scenario_vocab: {},
  examples: {},
  not_covered: [],
};
