import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting } from '@codemirror/language';
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
  ViewPlugin,
  Decoration,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { AuthoringCatalog } from '@/services/authoring';
import { cx } from '@/utils/format';

import { DSL_COLOURS, dslHighlight, realDsl } from './dsl/language';

type Mode = 'light' | 'dark';

/**
 * A wrapped line continues under its own text, a little further in, as in
 * an IDE, instead of at the left edge (the requirement's indentation is its
 * structure).
 */
const hangingIndent = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view);
    }
    build(view: EditorView): DecorationSet {
      const marks = [];
      for (const { from, to } of view.visibleRanges) {
        for (let pos = from; pos <= to;) {
          const line = view.state.doc.lineAt(pos);
          const n = (line.text.match(/^\s*/)?.[0].length ?? 0) + 4;
          marks.push(
            Decoration.line({
              attributes: { style: `padding-left: calc(${n}ch + 6px); text-indent: -${n}ch` },
            }).range(line.from),
          );
          pos = line.to + 1;
        }
      }
      return Decoration.set(marks);
    }
  },
  { decorations: (v) => v.decorations },
);
const THEME_KEY = 'real.editor.theme';

function savedMode(): Mode {
  try {
    return window.localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function themeOf(mode: Mode) {
  const c = DSL_COLOURS[mode];
  return [
    EditorView.theme(
      {
        '&': { backgroundColor: c.background, color: c.text, fontSize: '13px' },
        '&.cm-focused': { outline: 'none' },
        '.cm-scroller': {
          fontFamily: 'var(--font-mono)',
          lineHeight: '1.7',
          minHeight: '26rem',
        },
        // "<=" must read as typed, never as a merged symbol
        '.cm-content': {
          caretColor: c.text,
          padding: '12px 0',
          fontVariantLigatures: 'none',
          fontFeatureSettings: '"liga" 0, "calt" 0',
        },
        '.cm-gutters': { backgroundColor: c.gutter, color: c.gutterText, border: 'none' },
        '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 14px' },
        '.cm-activeLine': { backgroundColor: c.activeLine },
        '.cm-activeLineGutter': { backgroundColor: c.activeLine, color: c.text },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
          backgroundColor: c.selection,
        },
        '.cm-cursor, .cm-dropCursor': { borderLeftColor: c.text, borderLeftWidth: '2px' },
        '.cm-placeholder': { color: c.comment, fontStyle: 'italic' },
        '.cm-tooltip': {
          backgroundColor: c.background,
          color: c.text,
          border: `1px solid ${c.gutterText}55`,
          borderRadius: '8px',
          boxShadow: '0 8px 24px rgb(0 0 0 / 0.18)',
          overflow: 'hidden',
        },
        '.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--font-mono)', maxHeight: '18rem' },
        '.cm-tooltip-autocomplete > ul > li': { padding: '3px 10px' },
        '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
          backgroundColor: c.selection,
          color: c.text,
        },
        '.cm-completionDetail': { color: c.comment, fontStyle: 'normal', marginLeft: '1em' },
        '.cm-completionInfo': {
          fontFamily: 'var(--font-sans)',
          fontSize: '12px',
          padding: '6px 10px',
        },
        '.cm-dsl-hover': {
          padding: '6px 10px',
          maxWidth: '24rem',
          fontFamily: 'var(--font-sans)',
          fontSize: '12px',
          lineHeight: '1.5',
        },
        '.cm-diagnostic': { fontFamily: 'var(--font-sans)', fontSize: '12px' },
      },
      { dark: mode === 'dark' },
    ),
    syntaxHighlighting(dslHighlight(mode)),
  ];
}

export interface DslProblem {
  line: number | null;
  column: number | null;
  message: string;
}

/**
 * The REAL-DSL editor: an IDE for one requirement. Keywords, clauses and
 * measurable parts in colour (the strings take the colour of their shape in
 * the goal model), completion that offers only what the grammar allows next,
 * hover notes, the parser's error marked on its line, light or dark. Read
 * only in the study build, with the same look.
 */
export function DslEditor({
  value,
  onChange,
  catalog,
  readOnly = false,
  problem = null,
  unimplemented = [],
  fileName,
  status,
  actions,
}: {
  value: string;
  onChange?: (text: string) => void;
  catalog: AuthoringCatalog;
  readOnly?: boolean;
  /** the parser's error, marked on its line */
  problem?: DslProblem | null;
  /** module names the simulator does not run, marked where they are used */
  unimplemented?: string[];
  fileName: ReactNode;
  status: ReactNode;
  /** buttons at the right of the editor's title bar */
  actions?: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const [mode, setMode] = useState<Mode>(savedMode);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const theme = useMemo(() => new Compartment(), []);
  const dsl = useMemo(() => realDsl(catalog), [catalog]);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initial = useRef({ value, mode });

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initial.current.value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          EditorView.lineWrapping,
          hangingIndent,
          dsl.language,
          theme.of(themeOf(initial.current.mode)),
          EditorState.readOnly.of(readOnly),
          readOnly
            ? []
            : [
                closeBrackets(),
                autocompletion({ override: [dsl.complete], activateOnTyping: true }),
                placeholder(
                  'Type MAINTAIN to start, or press Ctrl+Space for a whole requirement to fill in.',
                ),
              ],
          dsl.hover,
          lintGutter(),
          highlightSelectionMatches(),
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            ...completionKeymap,
            ...searchKeymap,
          ]),
          EditorView.contentAttributes.of({
            'aria-label': 'Requirement text',
            ...(readOnly ? { 'aria-readonly': 'true' } : {}),
          }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current?.(u.state.doc.toString());
            if (u.docChanged || u.selectionSet) {
              const head = u.state.selection.main.head;
              const line = u.state.doc.lineAt(head);
              setCursor({ line: line.number, col: head - line.from + 1 });
            }
          }),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
  }, [dsl, readOnly, theme]);

  // a text set from outside (a loaded file, the gaps, the study's requirement)
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value)
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: theme.reconfigure(themeOf(mode)) });
    try {
      window.localStorage.setItem(THEME_KEY, mode);
    } catch {
      /* the choice is kept for this page only */
    }
  }, [mode, theme]);

  // the parser's error and the modules the simulator does not run, on their lines
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const doc = v.state.doc;
    const diagnostics: Diagnostic[] = [];
    if (problem) {
      // no position (line -1): the text ended too early, so the mark goes at its end
      const atEnd = !problem.line || problem.line < 1;
      const line = doc.line(atEnd ? doc.lines : Math.min(problem.line!, doc.lines));
      const from = atEnd
        ? Math.max(line.to - 1, line.from)
        : Math.min(line.from + Math.max((problem.column ?? 1) - 1, 0), line.to);
      const end = doc.sliceString(from, line.to).match(/^\S+/)?.[0].length ?? 0;
      diagnostics.push({
        from,
        to: Math.min(from + Math.max(end, 1), doc.length),
        severity: 'error',
        message: problem.message.split('\n')[0] ?? 'Does not parse',
      });
    }
    const text = doc.toString();
    for (const name of unimplemented)
      for (const m of text.matchAll(new RegExp(`performed\\s+by\\s+("${escape(name)}")`, 'g'))) {
        const from = m.index! + m[0].length - m[1]!.length;
        diagnostics.push({
          from,
          to: from + m[1]!.length,
          severity: 'warning',
          message: `${name} is not implemented by the simulator: a run with it would fail.`,
        });
      }
    v.dispatch(setDiagnostics(v.state, diagnostics));
  }, [problem, unimplemented, value]);

  const c = DSL_COLOURS[mode];
  return (
    <div
      className="overflow-hidden rounded-xl border border-border-strong"
      style={{ backgroundColor: c.background, color: c.text }}
    >
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-3 py-2"
        style={{ backgroundColor: c.gutter, borderColor: `${c.gutterText}40` }}
      >
        <span
          className="rounded-md px-2 py-0.5 font-mono text-[11px] font-bold tracking-wide"
          style={{ backgroundColor: c.temporal, color: c.background }}
        >
          REAL-DSL
        </span>
        <span className="font-mono text-xs" style={{ color: c.text }}>
          {fileName}
        </span>
        {readOnly ? (
          <span
            className="rounded-full border px-2 py-0.5 text-[11px]"
            style={{ borderColor: c.gutterText, color: c.gutterText }}
          >
            read only
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-2">
          {actions}
          <button
            type="button"
            onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}
            aria-pressed={mode === 'dark'}
            aria-label="Dark editor"
            title={mode === 'light' ? 'Switch the editor to dark' : 'Switch the editor to light'}
            className="flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs"
            style={{ borderColor: `${c.gutterText}80`, color: c.text }}
          >
            <span aria-hidden="true">{mode === 'light' ? '☾' : '☀'}</span>
            {mode === 'light' ? 'Dark' : 'Light'}
          </button>
        </span>
      </div>
      <div ref={host} className={cx('min-w-0')} />
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-1.5 text-[11px]"
        style={{ backgroundColor: c.gutter, borderColor: `${c.gutterText}40`, color: c.gutterText }}
      >
        <span aria-live="polite">{status}</span>
        <span className="font-mono">
          Ln {cursor.line}, Col {cursor.col}
        </span>
        {readOnly ? null : (
          <span className="ml-auto">
            <kbd className="font-mono">Ctrl</kbd>+<kbd className="font-mono">Space</kbd> suggestions
            · hover a word for help
          </span>
        )}
      </div>
    </div>
  );
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
