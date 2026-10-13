import { Chip, KindChip, type ChipTone } from '@/components/ui/Chip';
import { CountLink } from '@/components/ui/CountLink';
import { Disclosure } from '@/components/ui/Disclosure';
import { FileName } from '@/components/ui/Section';
import {
  headline,
  ROUND_STATE_WORDS,
  roundState,
  type Link,
  type RoundSummary,
} from '@/domain/lineage';
import { reviewHash } from '@/state/route';
import { cx, displayDate, displayPercent, shortId } from '@/utils/format';

const STATE_TONE: Record<ReturnType<typeof roundState>, ChipTone> = {
  'not-finished': 'caution',
  'not-analysed': 'neutral',
  'report-unreadable': 'fail',
  'awaiting-signature': 'tool',
  'tool-proposal': 'tool',
  signed: 'human',
};

/** One round in the chain: version, system, counts that lead to the evidence, state. */
export function RoundRow({
  round,
  version,
}: {
  round: RoundSummary;
  /** The requirement version in the chain; leave out where there is no chain (no column). */
  version?: string | null;
}) {
  const state = roundState(round);
  const h = round.report ? headline(round.report) : null;
  const sut = round.meta.system_under_test;
  const link = (focus: string) => reviewHash(round.id, 3, focus);
  return (
    <article
      className={cx(
        'card grid gap-4 p-5',
        version !== undefined && 'md:grid-cols-[5rem_minmax(0,1fr)]',
      )}
      aria-labelledby={`round-${round.id}`}
    >
      {version !== undefined ? (
        <div>
          <p className="text-xs text-text-muted">version</p>
          <p className="text-2xl font-semibold leading-none">{version ?? '—'}</p>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={`round-${round.id}`} className="text-lg">
            {round.meta.round !== null && round.meta.round !== undefined
              ? `Round ${round.meta.round}`
              : 'Round'}
          </h2>
          <Chip tone={STATE_TONE[state]}>{ROUND_STATE_WORDS[state]}</Chip>
          <span className="font-mono text-xs text-text-muted" title={round.id}>
            {shortId(round.id, 10)}
          </span>
          <span className="text-xs text-text-faint">{displayDate(round.meta.created_at)}</span>
          <a href={reviewHash(round.id, 1)} className="ml-auto text-sm">
            Open →
          </a>
        </div>
        <p className="text-sm text-text-muted">
          {sut ? (
            <>
              braking{' '}
              <span className="dsl-performed font-mono text-xs">{sut.braking_mode ?? 'n/a'}</span> ·
              detector{' '}
              <span className="dsl-performed font-mono text-xs">{sut.yolo_model ?? 'n/a'}</span>
            </>
          ) : (
            'system under test not recorded'
          )}
          {' · '}
          {round.meta.mode ?? 'mode n/a'}
          {round.meta.n_scenarios !== null && round.meta.n_scenarios !== undefined
            ? ` · ${round.meta.n_scenarios} scenarios`
            : ''}
          {round.meta.trials_per_scenario !== null && round.meta.trials_per_scenario !== undefined
            ? ` × ${round.meta.trials_per_scenario}`
            : ''}
        </p>
        {h ? (
          <ul className="num flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Headline counts">
            <li>
              <CountLink href={link('all')}>{h.simulations}</CountLink> simulations
            </li>
            <li>
              <CountLink href={link('counted')}>{h.encounters}</CountLink> encounters
            </li>
            <li>
              <CountLink href={link('failures')} className={h.failures ? 'text-fail' : undefined}>
                {h.failures}
              </CountLink>{' '}
              failed ({displayPercent(h.failureRate)})
            </li>
            <li>
              <CountLink href={link('passed_stalled')}>{h.stalled}</CountLink> stalled
            </li>
            <li>
              <CountLink href={link('no_encounter')}>{h.noEncounter}</CountLink> no-encounter
            </li>
            <li>
              <CountLink href={link('set_aside')}>{h.setAside}</CountLink> set aside
            </li>
          </ul>
        ) : (
          <p className="text-sm text-text-muted">
            {round.reportError ? round.reportError.message : 'Not analysed yet.'}
          </p>
        )}
        <Disclosure summary="Provenance" compact>
          <p className="text-xs text-text-muted">
            Requirement source:{' '}
            {round.meta.requirement_source ? (
              <FileName>{round.meta.requirement_source}</FileName>
            ) : (
              'not recorded'
            )}{' '}
            · parent run:{' '}
            <span className="font-mono">
              {round.meta.parent_run_id ? shortId(round.meta.parent_run_id, 10) : 'none recorded'}
            </span>
          </p>
        </Disclosure>
      </div>
    </article>
  );
}

/** The change recorded between two consecutive rounds, with who signed it. */
export function ChangeRow({ link }: { link: Link }) {
  return (
    <div
      className="ml-8 flex flex-col gap-2 border-l-2 border-border py-4 pl-5 text-sm"
      aria-label="Change between rounds"
    >
      <p className="text-xs text-text-muted">
        {link.recorded ? 'Lineage recorded.' : 'No recorded lineage; shown in date order.'}
        {link.signedBy ? ` Signed by ${link.signedBy} on ${displayDate(link.decidedAt)}.` : ''}
      </p>
      {link.changes.length ? (
        <ul className="flex flex-col gap-1.5">
          {link.changes.map((ch, i) => (
            <li key={i} className="flex flex-wrap items-start gap-2">
              <KindChip kind={ch.kind} long />
              <span className="min-w-0 flex-1">{ch.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-text-faint">No requirement change recorded.</p>
      )}
    </div>
  );
}
