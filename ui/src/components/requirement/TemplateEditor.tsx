import { useId, type ReactNode } from 'react';

import {
  emptyOperation,
  keyTask,
  type ClauseItem,
  type OperationForm,
  type RequirementForm,
  type Role,
  type SubGoalForm,
} from '@/domain/requirementForm';
import type { AuthoringCatalog, CheckResult, ClassifiedItem } from '@/services/authoring';
import { cx } from '@/utils/format';

/**
 * The requirement as text with gaps: the DSL's fixed words are plain text,
 * every gap is filled in place - free text with suggestions taken from the
 * project's example requirements (and from what is already written, e.g. the
 * perception outputs as the braking input), bounded choices as menus read
 * from the code (temporal operator, the modules the executor runs, measurable
 * quantities, operators). Each numbered line is one line of the DSL that
 * `toDsl` writes, so the parser's line numbers point here; the line it
 * rejects is marked.
 */

type Suggest = (key: string, role?: Role) => string[];

export function TemplateEditor({
  form,
  setForm,
  catalog,
  check,
}: {
  form: RequirementForm;
  setForm: (f: RequirementForm) => void;
  catalog: AuthoringCatalog;
  check: CheckResult | null;
}) {
  const patch = (p: Partial<RequirementForm>) => setForm({ ...form, ...p });
  const errorLine = check && !check.ok ? check.error.line : null;
  const sug = catalog.suggestions;
  const perceptionOutputs = form.subgoals
    .filter((s) => s.operation.role === 'perception')
    .flatMap((s) => s.operation.outputs)
    .filter(Boolean);
  const suggest: Suggest = (key, role) => {
    const fromExamples =
      key === 'goal' || key === 'scenario' || key === 'free_assumption' || key === 'free_soft_goal'
        ? (sug?.[key] ?? [])
        : role
          ? (sug?.[role]?.[key] ?? [])
          : [];
    const fromText =
      role === 'braking' && key === 'input'
        ? perceptionOutputs
        : role === 'braking' && key === 'condition'
          ? perceptionOutputs.map((o) => `${o}=True`)
          : [];
    return [...new Set([...fromText, ...fromExamples])];
  };

  let line = 0;
  const L = (indent: number, children: ReactNode, extra?: ReactNode) => {
    line += 1;
    return (
      <Line key={`l${line}`} n={line} indent={indent} error={line === errorLine} extra={extra}>
        {children}
      </Line>
    );
  };

  const rows: ReactNode[] = [];
  rows.push(
    L(
      0,
      <>
        <Pick
          label="temporal operator"
          value={form.temporal}
          options={catalog.temporal_ops}
          onChange={(temporal) => patch({ temporal })}
          tone="keyword"
        />{' '}
        <Quoted>
          <Hole
            label="goal name"
            value={form.objective}
            onChange={(objective) => patch({ objective })}
            suggestions={suggest('goal')}
            placeholder="goal"
          />
        </Quoted>
      </>,
    ),
  );
  rows.push(L(1, <Kw>by</Kw>));

  form.subgoals.forEach((sg, i) => {
    const setSub = (next: SubGoalForm) =>
      patch({ subgoals: form.subgoals.map((s, k) => (k === i ? next : s)) });
    const setOp = (p: Partial<OperationForm>) =>
      setSub({ ...sg, operation: { ...sg.operation, ...p } });
    const op = sg.operation;
    const role = op.role;
    const key = keyTask(role, catalog);
    const r = catalog.roles[role];
    const modules = r.modules;
    if (i > 0) rows.push(L(1, <Kw>followed by</Kw>));
    rows.push(
      L(
        2,
        <>
          <Quoted>
            <Hole
              label={`sub-goal ${i + 1} name`}
              value={sg.objective}
              onChange={(objective) => setSub({ ...sg, objective })}
              suggestions={suggest('sub_goal', role)}
              placeholder="sub-goal"
            />
          </Quoted>{' '}
          <Kw>using</Kw>{' '}
          <Quoted>
            <Hole
              label={`sub-goal ${i + 1} agent`}
              value={sg.agent}
              onChange={(agent) => setSub({ ...sg, agent })}
              suggestions={suggest('agent', role)}
              placeholder="agent"
            />
          </Quoted>
        </>,
        <span className="flex items-center gap-0.5">
          <Mini label={`move sub-goal ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
            ↑
          </Mini>
          <Mini
            label={`move sub-goal ${i + 1} down`}
            disabled={i === form.subgoals.length - 1}
            onClick={() => move(i, 1)}
          >
            ↓
          </Mini>
          <Mini
            label={`remove sub-goal ${i + 1}`}
            disabled={form.subgoals.length <= 1}
            onClick={() => patch({ subgoals: form.subgoals.filter((_, k) => k !== i) })}
          >
            ×
          </Mini>
        </span>,
      ),
    );
    rows.push(L(3, <Kw>operationalized as</Kw>));
    const keyAt = op.tasks.indexOf(key);
    rows.push(
      L(
        4,
        <>
          {op.tasks.map((t, k) => (
            <span key={k} className="inline-flex items-baseline">
              {k > 0 ? <Amp /> : null}
              {t === key ? (
                <span title="the executor runs the module on this task and nowhere else">
                  &quot;{t}&quot;
                </span>
              ) : (
                <Removable
                  label={`remove task ${k + 1}`}
                  onRemove={() => setOp({ tasks: op.tasks.filter((_, j) => j !== k) })}
                >
                  <Quoted>
                    <Hole
                      label={`sub-goal ${i + 1} task ${k + 1}`}
                      value={t}
                      onChange={(v) => setOp({ tasks: op.tasks.map((x, j) => (j === k ? v : x)) })}
                      suggestions={suggest('task', role)}
                      placeholder="task"
                    />
                  </Quoted>
                </Removable>
              )}
            </span>
          ))}
          <Add
            label={`add a task before ${key}`}
            onClick={() => {
              const at = keyAt < 0 ? op.tasks.length : keyAt;
              setOp({ tasks: [...op.tasks.slice(0, at), '', ...op.tasks.slice(at)] });
            }}
          >
            + task
          </Add>{' '}
          {op.condition || role === 'braking' ? (
            <>
              <Kw>if</Kw>{' '}
              <Quoted>
                <Hole
                  label={`sub-goal ${i + 1} condition`}
                  value={op.condition}
                  onChange={(condition) => setOp({ condition })}
                  suggestions={suggest('condition', role)}
                  placeholder="condition"
                  optional
                />
              </Quoted>{' '}
            </>
          ) : (
            <Add
              label={`add a condition to sub-goal ${i + 1}`}
              onClick={() => setOp({ condition: ' ' })}
            >
              + if
            </Add>
          )}{' '}
          <Kw>performed by</Kw>{' '}
          <Quoted>
            <Pick
              label={`sub-goal ${i + 1} module`}
              value={op.module}
              options={modules}
              onChange={(module) => setOp({ module })}
              tone="module"
              empty={
                role === 'perception'
                  ? 'no modules found - check model/'
                  : 'no braking modules in util.py'
              }
            />
          </Quoted>
        </>,
      ),
    );
    rows.push(
      L(
        4,
        <>
          <Kw>taking input</Kw>{' '}
          <List
            label={`sub-goal ${i + 1} input`}
            values={op.inputs}
            onChange={(inputs) => setOp({ inputs })}
            suggestions={suggest('input', role)}
            placeholder="input"
          />{' '}
          <Kw>producing output</Kw>{' '}
          <List
            label={`sub-goal ${i + 1} output`}
            values={op.outputs}
            onChange={(outputs) => setOp({ outputs })}
            suggestions={suggest('output', role)}
            placeholder="output"
          />
        </>,
      ),
    );
  });
  rows.push(
    <Gutterless key="add-sub" indent={1}>
      <span className="text-code-keyword">followed by</span>
      {(['perception', 'braking'] as const).map((role) => (
        <Add
          key={role}
          label={`add a ${role} sub-goal`}
          onClick={() =>
            patch({
              subgoals: [
                ...form.subgoals,
                { objective: '', agent: '', operation: emptyOperation(role, catalog) },
              ],
            })
          }
        >
          + {role}
        </Add>
      ))}
    </Gutterless>,
  );
  rows.push(L(1, <Kw>in scenario where</Kw>));
  rows.push(
    L(
      2,
      <Quoted>
        <Hole
          label="scenario"
          value={form.scenario}
          onChange={(scenario) => patch({ scenario })}
          suggestions={suggest('scenario')}
          placeholder="scenario"
          wide
        />
      </Quoted>,
    ),
  );

  const clause = (
    keyword: 'assuming' | 'ensuring',
    items: ClauseItem[],
    onChange: (items: ClauseItem[]) => void,
    quantities: { name: string; disabled: boolean; title: string }[],
    freeKey: 'free_assumption' | 'free_soft_goal',
    classified: ClassifiedItem[] | null,
  ) => {
    const first = quantities.find((q) => !q.disabled)?.name ?? '';
    const add = (
      <span className="inline-flex gap-1">
        <Add
          label={`add a measurable ${keyword} item`}
          disabled={!first}
          onClick={() =>
            onChange([
              ...items,
              { mode: 'checked', quantity: first, op: catalog.operators[0] ?? '<=', value: '' },
            ])
          }
        >
          + measurable
        </Add>
        <Add
          label={`add a free-text ${keyword} item`}
          onClick={() => onChange([...items, { mode: 'free', text: '' }])}
        >
          + text
        </Add>
      </span>
    );
    if (!items.length)
      return (
        <Gutterless key={keyword} indent={1}>
          <span className="text-code-keyword">{keyword}</span>
          {add}
        </Gutterless>
      );
    return L(
      1,
      <>
        <Kw>{keyword}</Kw>{' '}
        {items.map((item, k) => {
          const verdict = classified?.[k];
          const set = (next: ClauseItem) => onChange(items.map((x, j) => (j === k ? next : x)));
          return (
            <span key={k} className="inline-flex items-baseline">
              {k > 0 ? <Amp /> : null}
              <Removable
                label={`remove ${keyword} item ${k + 1}`}
                onRemove={() => onChange(items.filter((_, j) => j !== k))}
              >
                <Quoted>
                  {item.mode === 'checked' ? (
                    <>
                      <Pick
                        label={`${keyword} ${k + 1} quantity`}
                        value={item.quantity}
                        options={quantities.map((q) => q.name)}
                        disabledOptions={quantities.filter((q) => q.disabled).map((q) => q.name)}
                        onChange={(quantity) => set({ ...item, quantity })}
                        tone="quantity"
                      />{' '}
                      <Pick
                        label={`${keyword} ${k + 1} operator`}
                        value={item.op}
                        options={catalog.operators}
                        onChange={(op) => set({ ...item, op })}
                        tone="operator"
                      />{' '}
                      <Hole
                        label={`${keyword} ${k + 1} value`}
                        value={item.value}
                        onChange={(value) => set({ ...item, value })}
                        suggestions={[]}
                        placeholder="value"
                      />
                    </>
                  ) : (
                    <Hole
                      label={`${keyword} ${k + 1} text`}
                      value={item.text}
                      onChange={(text) => set({ mode: 'free', text })}
                      suggestions={suggest(freeKey)}
                      placeholder="text"
                      unchecked
                    />
                  )}
                </Quoted>
              </Removable>
              {verdict?.kind === 'rejected' ? (
                <span className="ml-0.5 cursor-help text-fail" title={verdict.message}>
                  ✕
                </span>
              ) : item.mode === 'free' || verdict?.kind === 'free_text' ? (
                <span className="ml-0.5 cursor-help text-caution" title="not checked automatically">
                  ◌
                </span>
              ) : null}
            </span>
          );
        })}{' '}
        {add}
      </>,
    );
  };

  rows.push(
    clause(
      'assuming',
      form.assumptions,
      (assumptions) => patch({ assumptions }),
      catalog.assumption_quantities.map((q) => ({
        name: q.name,
        disabled: !q.available,
        title: q.available ? `${q.level} · ${q.source}` : 'not measured in this scene version',
      })),
      'free_assumption',
      check?.ok ? check.assumptions : null,
    ),
  );
  rows.push(
    clause(
      'ensuring',
      form.softGoals,
      (softGoals) => patch({ softGoals }),
      catalog.soft_goal_quantities.map((q) => ({
        name: q.name,
        disabled: false,
        title: q.meaning,
      })),
      'free_soft_goal',
      check?.ok ? check.soft_goals : null,
    ),
  );

  function move(i: number, d: number) {
    const next = [...form.subgoals];
    const [moved] = next.splice(i, 1);
    next.splice(i + d, 0, moved!);
    patch({ subgoals: next });
  }

  return (
    <div
      className="dsl-editor rounded-xl bg-surface-sunken py-3 font-mono text-[12.5px] leading-7"
      role="group"
      aria-label="Requirement, with gaps to fill"
    >
      {rows}
    </div>
  );
}

// ------------------------------------------------------------------ pieces

function Line({
  n,
  indent,
  error,
  extra,
  children,
}: {
  n: number;
  indent: number;
  error: boolean;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cx('group/line flex items-start', error && 'bg-fail-soft')}>
      <span
        aria-hidden="true"
        className={cx(
          'num w-9 shrink-0 pr-3 text-right text-[11px] leading-7 select-none',
          error ? 'text-fail' : 'text-text-faint',
        )}
      >
        {n}
      </span>
      <div className="min-w-0 flex-1 text-text" style={{ paddingLeft: `${indent * 2}ch` }}>
        {children}
      </div>
      {extra ? (
        <div className="shrink-0 pr-3 opacity-0 group-focus-within/line:opacity-100 group-hover/line:opacity-100">
          {extra}
        </div>
      ) : null}
    </div>
  );
}

function Gutterless({ indent, children }: { indent: number; children: ReactNode }) {
  return (
    <div className="group/line flex items-center">
      <span aria-hidden="true" className="w-9 shrink-0" />
      <div
        className="flex flex-wrap items-center gap-1.5 font-sans text-xs"
        style={{ paddingLeft: `${indent * 2}ch` }}
      >
        {children}
      </div>
    </div>
  );
}

function Kw({ children }: { children: ReactNode }) {
  return <span className="text-code-keyword">{children}</span>;
}

function Amp() {
  return <span className="px-1 text-text-muted">&amp;</span>;
}

function Quoted({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-baseline whitespace-nowrap">
      <span className="text-text-muted">&quot;</span>
      {children}
      <span className="text-text-muted">&quot;</span>
    </span>
  );
}

/** A free-text gap: sized to its text, with suggestions; empty gaps stand out. */
function Hole({
  label,
  value,
  onChange,
  suggestions,
  placeholder,
  optional = false,
  unchecked = false,
  wide = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder: string;
  optional?: boolean;
  unchecked?: boolean;
  wide?: boolean;
}) {
  const id = useId();
  const shown = value.trim() ? value : placeholder;
  const width = Math.min(wide || unchecked ? 72 : 44, Math.max(3, shown.length + 1));
  const empty = !value.trim();
  const quote = value.includes('"');
  return (
    <>
      <input
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        list={suggestions.length ? id : undefined}
        aria-invalid={quote || undefined}
        title={
          quote
            ? 'no double quotes inside a gap'
            : unchecked
              ? 'free text: not checked automatically'
              : undefined
        }
        style={{ width: `calc(${width}ch + 6px)` }}
        className={cx(
          // reads as text; only the focused gap looks like a field
          'rounded-[3px] border-0 bg-transparent px-[3px] py-0 font-mono text-[12.5px] leading-6 text-text outline-none',
          'placeholder:text-text-muted placeholder:italic hover:bg-fill/60 focus:bg-surface-raised focus:shadow-[0_0_0_1px_var(--color-border-strong)]',
          quote
            ? 'text-fail underline decoration-fail decoration-wavy'
            : empty
              ? cx('border-b border-dashed', optional ? 'border-border-strong' : 'border-human/60')
              : unchecked
                ? 'underline decoration-caution/50 decoration-dotted underline-offset-4'
                : '',
        )}
      />
      {suggestions.length ? (
        <datalist id={id}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      ) : null}
    </>
  );
}

/** A bounded gap: a menu of what the code allows, styled as part of the text. */
function Pick({
  label,
  value,
  options,
  onChange,
  tone,
  empty,
  disabledOptions = [],
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  tone: 'keyword' | 'module' | 'quantity' | 'operator';
  empty?: string;
  disabledOptions?: string[];
}) {
  if (!options.length)
    return (
      <span className="rounded-md bg-fail-soft px-1 font-sans text-xs text-fail">
        {empty ?? 'nothing to choose'}
      </span>
    );
  return (
    <select
      aria-label={label}
      value={options.includes(value) ? value : ''}
      onChange={(e) => onChange(e.target.value)}
      className={cx(
        'cursor-pointer appearance-none rounded-[3px] border-0 py-0 pr-3.5 pl-[3px] font-mono text-[12.5px] leading-6 outline-none',
        'bg-[length:7px] bg-[right_3px_center] bg-no-repeat focus:shadow-[0_0_0_1px_var(--color-border-strong)]',
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 5'%3E%3Cpath d='M1 1l3 3 3-3' fill='none' stroke='%238e8e93' stroke-width='1.3'/%3E%3C/svg%3E\")]",
        'bg-transparent hover:bg-fill/60',
        tone === 'keyword' && 'font-semibold text-code-keyword',
        tone === 'module' && 'text-change-s',
        tone === 'quantity' && 'text-text',
        tone === 'operator' && 'text-text-muted',
      )}
    >
      {!options.includes(value) ? (
        <option value="" disabled>
          {value ? `${value} (not runnable)` : 'choose…'}
        </option>
      ) : null}
      {options.map((o) => (
        <option key={o} value={o} disabled={disabledOptions.includes(o)}>
          {o}
          {disabledOptions.includes(o) ? ' - not measured in this scene version' : ''}
        </option>
      ))}
    </select>
  );
}

function List({
  label,
  values,
  onChange,
  suggestions,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  suggestions: string[];
  placeholder: string;
}) {
  return (
    <>
      {values.map((v, k) => (
        <span key={k} className="inline-flex items-baseline">
          {k > 0 ? <Amp /> : null}
          <Removable
            label={`remove ${label} ${k + 1}`}
            disabled={values.length <= 1}
            onRemove={() => onChange(values.filter((_, j) => j !== k))}
          >
            <Quoted>
              <Hole
                label={`${label} ${k + 1}`}
                value={v}
                onChange={(x) => onChange(values.map((y, j) => (j === k ? x : y)))}
                suggestions={suggestions.filter((s) => s === v || !values.includes(s))}
                placeholder={placeholder}
              />
            </Quoted>
          </Removable>
        </span>
      ))}
      <Add label={`add another ${label}`} onClick={() => onChange([...values, ''])}>
        +&nbsp;&amp;
      </Add>
    </>
  );
}

function Removable({
  label,
  onRemove,
  disabled = false,
  children,
}: {
  label: string;
  onRemove: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <span className="group/item relative inline-flex items-baseline">
      {children}
      {!disabled ? (
        <button
          type="button"
          aria-label={label}
          onClick={onRemove}
          className="-ml-0.5 rounded px-0.5 font-sans text-[11px] text-text-faint opacity-0 group-focus-within/item:opacity-100 group-hover/item:opacity-100 hover:text-fail focus:opacity-100"
        >
          ×
        </button>
      ) : null}
    </span>
  );
}

function Add({
  label,
  onClick,
  disabled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="mx-0.5 rounded px-1 font-sans text-[11px] leading-5 text-text-faint hidden group-focus-within/line:inline group-hover/line:inline hover:bg-fill hover:text-text focus:inline disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Mini({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded px-1 font-sans text-xs text-text-muted hover:bg-fill hover:text-text disabled:opacity-30"
    >
      {children}
    </button>
  );
}
