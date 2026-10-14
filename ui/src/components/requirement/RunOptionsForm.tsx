import { useId } from 'react';

import { Disclosure } from '@/components/ui/Disclosure';
import { TextField } from '@/components/ui/Field';
import {
  DEFAULT_TIME,
  DEFAULT_TRIALS,
  GRID_SCENARIOS,
  type RunOptions,
  type ScenarioList,
  type Search,
} from '@/services/authoring';
import { cx } from '@/utils/format';

const SEARCHES: [Search, string][] = [
  ['grid', `Grid (${GRID_SCENARIOS})`],
  ['list', 'List'],
  ['ge', 'GE search'],
];
const GRAMMARS = ['v2/scene_v2.bnf', 'v3/scene_v3.bnf'];

/** A whole number from a field, or undefined (the job script's default) when empty. */
function num(value: string): number | undefined {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * The submit options, one control per job script variable
 * (infra/hpc/run_real_av.slurm); an empty field is the job script's default.
 */
export function RunOptionsForm({
  value,
  onChange,
  lists,
}: {
  value: RunOptions;
  onChange: (o: RunOptions) => void;
  lists: ScenarioList[];
}) {
  const set = (patch: Partial<RunOptions>) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex rounded-lg bg-fill p-0.5 self-start" role="group" aria-label="Search">
        {SEARCHES.map(([s, label]) => (
          <button
            key={s}
            type="button"
            aria-pressed={value.search === s}
            // a new search keeps the time and provenance, drops the other searches' options
            onClick={() =>
              onChange({
                search: s,
                time: value.time,
                parent_run_id: value.parent_run_id,
                round: value.round,
              })
            }
            className={cx(
              'rounded-md px-2.5 py-0.5 text-xs',
              value.search === s
                ? 'bg-surface-raised font-medium text-text shadow-[0_1px_3px_rgb(0_0_0/0.12)] dark:bg-[#5a5a5e]'
                : 'text-text-muted',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Runs per scenario"
          type="number"
          min={1}
          placeholder={String(DEFAULT_TRIALS[value.search])}
          value={value.trials ?? ''}
          onChange={(e) => set({ trials: num(e.target.value) })}
        />
        <TextField
          label="Time limit"
          hint={`HH:MM:SS, at most ${DEFAULT_TIME}`}
          placeholder={DEFAULT_TIME}
          value={value.time ?? ''}
          onChange={(e) => set({ time: e.target.value || undefined })}
        />
        {value.search === 'list' ? (
          <Select
            label="Scenario list"
            value={value.scenario_file ?? ''}
            onChange={(scenario_file) => set({ scenario_file: scenario_file || undefined })}
            options={lists.map((l) => [l.path, `${l.path} (${l.scenarios})`])}
            empty="choose a list…"
          />
        ) : null}
        {value.search === 'ge' ? (
          <>
            <TextField
              label="Population"
              type="number"
              min={1}
              placeholder="16"
              value={value.population ?? ''}
              onChange={(e) => set({ population: num(e.target.value) })}
            />
            <TextField
              label="Generations"
              type="number"
              min={1}
              placeholder="6"
              value={value.generations ?? ''}
              onChange={(e) => set({ generations: num(e.target.value) })}
            />
            <Select
              label="Grammar"
              value={value.grammar ?? 'v2/scene_v2.bnf'}
              onChange={(grammar) => set({ grammar })}
              options={GRAMMARS.map((g) => [g, g])}
            />
          </>
        ) : null}
      </div>
      <Disclosure summary="Provenance (optional)">
        <div className="grid gap-3 pt-2 sm:grid-cols-2">
          <TextField
            label="Parent run"
            placeholder="32-character run id"
            value={value.parent_run_id ?? ''}
            onChange={(e) => set({ parent_run_id: e.target.value.trim() || undefined })}
          />
          <TextField
            label="Round"
            type="number"
            min={1}
            value={value.round ?? ''}
            onChange={(e) => set({ round: num(e.target.value) })}
          />
        </div>
      </Disclosure>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  empty,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  empty?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-text-muted">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface-raised px-3 py-1.5 font-mono text-xs text-text"
      >
        {empty ? <option value="">{empty}</option> : null}
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}
