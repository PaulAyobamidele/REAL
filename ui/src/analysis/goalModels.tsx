/* eslint-disable react-refresh/only-export-components -- a page entry, not a module of components */
/**
 * The study's goal models, drawn with the tool's own layout: one per
 * participant (their R1, the changes outlined) and the combined one (R0 with
 * every change, each counted). Data: window.__GOAL_MODELS__, the
 * goal_models.json of scripts/analysis/study_goal_models.py. Opened only by
 * ui/scripts/analysis/render_goal_models.mjs, which saves each figure as a PNG.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { KaosDiagram } from '@/components/requirement/KaosDiagram';
import { buildGoalModel } from '@/domain/goalModel';
import { layoutKaos, type KaosLayout } from '@/domain/kaosLayout';
import { checkResultSchema, modelSourceFromCheck } from '@/services/authoring';
import '@/styles/app.css';

interface Change {
  kind: 'D' | 'R' | 'S';
  text: string;
  task?: string;
  from?: string | null;
  count?: number;
  of?: number;
}
interface Participant {
  id: string;
  expertise?: string | null;
  car?: string | null;
  check?: unknown;
  changes?: Change[];
  own_words?: { obstacle: string; text: string }[];
  error?: unknown;
}
interface Data {
  participants: Participant[];
  combined: { check: unknown; badges: Change[]; unchanged: number; of: number };
}

const KIND = { D: 'assumption added', R: 'soft goal added', S: 'module changed' } as const;

function layoutOf(check: unknown): KaosLayout | null {
  const parsed = checkResultSchema.parse(check);
  if (!parsed.ok) return null;
  const result = layoutKaos(buildGoalModel(modelSourceFromCheck(parsed)), { obstacles: [] });
  return result.ok ? result : null;
}

/** The box a change shows in: an added assumption or soft goal, or the agent running the new module. */
function boxOf(layout: KaosLayout, c: Change, module: 'from' | 'to' = 'to') {
  if (c.kind === 'S') {
    const name = module === 'to' ? c.text : c.from;
    return layout.boxes.find((b) => b.kind === 'agent' && b.note?.includes(String(name)));
  }
  const kind = c.kind === 'D' ? 'domain' : 'soft';
  return layout.boxes.find((b) => b.kind === kind && b.title.includes(c.text));
}

/** Count badges over the diagram, placed on the boxes of the svg the diagram draws. */
function Badges({ layout, badges }: { layout: KaosLayout; badges: Change[] }) {
  const host = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<{ left: number; top: number; scale: number } | null>(null);
  useLayoutEffect(() => {
    const svg = host.current?.parentElement?.querySelector('svg');
    const box = host.current?.parentElement?.getBoundingClientRect();
    if (!svg || !box) return;
    const r = svg.getBoundingClientRect();
    setFrame({ left: r.left - box.left, top: r.top - box.top, scale: r.width / layout.width });
  }, [layout]);
  return (
    <div ref={host} className="pointer-events-none absolute inset-0">
      {frame
        ? badges.map((c, i) => {
            // a module choice sits on the operation's agent (R0's module); the rest on their own box
            const b = boxOf(layout, c, c.kind === 'S' ? 'from' : 'to');
            if (!b) return null;
            const stack = badges
              .slice(0, i)
              .filter((o) => boxOf(layout, o, o.kind === 'S' ? 'from' : 'to') === b).length;
            return (
              <span
                key={i}
                className="absolute rounded-full bg-[color:var(--color-header)] px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-white shadow"
                style={{
                  left: frame.left + (b.x + b.w - 8) * frame.scale,
                  top: frame.top + (b.y - 10 + stack * 22) * frame.scale,
                }}
              >
                {c.kind === 'S' ? `${c.text}: ` : ''}
                {c.count} of {c.of}
              </span>
            );
          })
        : null}
    </div>
  );
}

function Figure({
  id,
  title,
  sub,
  children,
}: {
  id: string;
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section data-figure={id} className="flex w-[1400px] flex-col gap-3 bg-surface p-6">
      <div>
        <h2 className="text-xl font-bold">{title}</h2>
        {sub ? <p className="text-sm text-text-muted">{sub}</p> : null}
      </div>
      {children}
    </section>
  );
}

function App({ data }: { data: Data }) {
  const combined = layoutOf(data.combined.check);
  return (
    <main className="flex flex-col items-start gap-10 p-6">
      {combined ? (
        <Figure
          id="combined"
          title={`Combined: the changes ${data.combined.of} participants made to R0`}
          sub={`Each badge: how many participants made that change. ${data.combined.unchanged} of ${data.combined.of} left R1 as R0.`}
        >
          <div className="relative">
            <KaosDiagram
              layout={combined}
              selectedObstacleId={null}
              onSelectObstacle={() => {}}
              withObstacles={false}
            />
            <Badges layout={combined} badges={data.combined.badges} />
          </div>
        </Figure>
      ) : null}
      {data.participants.map((p) => {
        const layout = p.check ? layoutOf(p.check) : null;
        const changed = (p.changes ?? [])
          .map((c) => (layout ? boxOf(layout, c)?.id : null))
          .filter(Boolean) as string[];
        return (
          <Figure
            key={p.id}
            id={p.id}
            title={`${p.id}${p.expertise ? ` · ${p.expertise}` : ''}`}
            sub={
              layout
                ? (p.changes ?? []).map((c) => `${KIND[c.kind]}: ${c.text}`).join(' · ') ||
                  'R1 is R0 (no change)'
                : 'R1 does not parse'
            }
          >
            {layout ? (
              <KaosDiagram
                layout={layout}
                selectedObstacleId={null}
                onSelectObstacle={() => {}}
                withObstacles={false}
                highlight={changed}
              />
            ) : null}
            {p.own_words?.length ? (
              <p className="text-sm">
                <b>Refined in their own words (not in R1):</b>{' '}
                {p.own_words.map((w) => `${w.obstacle}: “${w.text}”`).join(' · ')}
              </p>
            ) : null}
          </Figure>
        );
      })}
    </main>
  );
}

const data = (window as unknown as { __GOAL_MODELS__?: Data }).__GOAL_MODELS__;
createRoot(document.getElementById('root')!).render(
  data ? <App data={data} /> : <p className="p-6">No goal_models.json given.</p>,
);
