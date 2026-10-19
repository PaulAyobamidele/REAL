import { marked, type Token, type Tokens } from 'marked';
import { useEffect, useMemo, useState } from 'react';

import manualText from '@docs/manual/real-dsl.md?raw';
import { DslBlock } from '@/components/requirement/DslBlock';
import { buttonClass } from '@/components/ui/buttonClass';
import { PageActions } from '@/components/ui/PageActions';
import { routeHash } from '@/state/route';
import { authorTitle } from '@/study/labels';

/**
 * The REAL-DSL manual as a page (#/manual): docs/manual/real-dsl.md, one
 * source for the repository and the tool, read like a man page - every
 * section in order, the list of sections beside it marking where you are.
 * REAL-DSL examples are coloured as everywhere else in the tool.
 */
export function ManualPage() {
  const sections = useMemo(() => splitSections(manualText), []);
  const [current, setCurrent] = useState(sections[0]?.id ?? '');

  // the section in view is the one marked in the list
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const seen = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setCurrent(top.target.id);
      },
      { rootMargin: '-80px 0px -60% 0px' },
    );
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) seen.observe(el);
    }
    return () => seen.disconnect();
  }, [sections]);

  const go = (id: string) => {
    setCurrent(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <h1 className="text-2xl lg:text-3xl">REAL-DSL Manual</h1>
        <p className="prose-width text-base text-text-muted">
          The requirement language of REAL: how to write a requirement, what each keyword means, and
          what the tool checks.
        </p>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav
          aria-label="Manual sections"
          className="card p-3 lg:sticky lg:top-16 lg:max-h-[calc(100dvh-5rem)] lg:overflow-y-auto"
        >
          <ul className="flex flex-row flex-wrap gap-1 lg:flex-col">
            {sections.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  aria-current={s.id === current ? 'true' : undefined}
                  onClick={() => go(s.id)}
                  className={
                    s.id === current
                      ? 'w-full rounded-md border-l-[3px] border-human bg-human-soft px-2.5 py-1 text-left text-sm font-semibold text-text'
                      : 'w-full rounded-md border-l-[3px] border-transparent px-2.5 py-1 text-left text-sm text-text-muted hover:bg-fill hover:text-text'
                  }
                >
                  {s.title}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <article className="card manual flex min-w-0 flex-col gap-2 p-6 lg:p-8">
          {sections.map((s) => (
            <section
              key={s.id}
              id={s.id}
              aria-label={s.title}
              className="scroll-mt-20 border-b border-border pb-4 last:border-b-0"
            >
              <h2>{s.title}</h2>
              <ManualBody tokens={s.tokens} />
            </section>
          ))}
        </article>
      </div>
      <PageActions>
        <a href={routeHash({ screen: 'author' })} className={buttonClass('primary', 'lg')}>
          Go to {authorTitle()} →
        </a>
      </PageActions>
    </div>
  );
}

interface Section {
  id: string;
  title: string;
  tokens: Token[];
}

/** The manual by its `##` sections (NAME, SYNOPSIS, ...), the title line dropped. */
function splitSections(text: string): Section[] {
  const sections: Section[] = [];
  for (const token of marked.lexer(text)) {
    if (token.type === 'heading' && (token as Tokens.Heading).depth === 1) continue;
    if (token.type === 'heading' && (token as Tokens.Heading).depth === 2) {
      const raw = (token as Tokens.Heading).text;
      sections.push({
        id: `manual-${raw.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        title: raw.charAt(0) + raw.slice(1).toLowerCase(),
        tokens: [],
      });
    } else sections.at(-1)?.tokens.push(token);
  }
  return sections;
}

function ManualBody({ tokens }: { tokens: Token[] }) {
  // REAL-DSL blocks as DslBlock; every other run of tokens as Markdown
  const parts: ({ dsl: string } | { html: string })[] = [];
  let run: Token[] = [];
  const flush = () => {
    if (run.length) {
      const list = Object.assign([...run], { links: {} }) as unknown as Parameters<
        typeof marked.parser
      >[0];
      parts.push({ html: marked.parser(list) });
    }
    run = [];
  };
  for (const t of tokens) {
    if (t.type === 'code' && (t as Tokens.Code).lang === 'real-dsl') {
      flush();
      parts.push({ dsl: (t as Tokens.Code).text });
    } else run.push(t);
  }
  flush();
  return (
    <>
      {parts.map((p, i) =>
        'dsl' in p ? (
          <DslBlock key={i} text={p.dsl} label="REAL-DSL example" className="manual-dsl" />
        ) : (
          // our own file, rendered by marked: no outside input
          <div key={i} dangerouslySetInnerHTML={{ __html: p.html }} />
        ),
      )}
    </>
  );
}
