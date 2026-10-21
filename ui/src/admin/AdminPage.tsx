import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { Instructions } from '@/components/ui/Instructions';
import { Notice } from '@/components/ui/Notice';
import { adminClient, BUCKET } from '@/study/upload';
import { zipFiles } from '@/study/zip';
import { displayDate } from '@/utils/format';

/**
 * The researcher's page: sign in with the one account the project allows,
 * see every signed session, and download them (one, or all in a single zip,
 * ready for scripts/analysis/study_goal_models.py). Nothing here changes or
 * deletes a session.
 */
interface Row {
  id: string;
  created_at: string;
  participant: string;
  expertise: string | null;
  car: string | null;
  started_at: string | null;
  signed_at: string | null;
  build: string | null;
  file_path: string;
  size_bytes: number;
}

function save(name: string, bytes: Uint8Array | Blob) {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const minutes = (a: string | null, b: string | null) =>
  a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 60_000) : null;

export function AdminPage() {
  const db = useMemo(() => adminClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!db) return;
    void db.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = db.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [db]);

  const load = useCallback(async () => {
    if (!db) return;
    setError(null);
    const { data, error: e } = await db
      .from('submissions')
      .select('*')
      .order('created_at', { ascending: false });
    if (e) setError(e.message);
    else setRows(data as Row[]);
  }, [db]);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  const fetchZip = async (r: Row): Promise<Uint8Array> => {
    const { data, error: e } = await db!.storage.from(BUCKET).download(r.file_path);
    if (e || !data) throw new Error(`${r.file_path}: ${e?.message ?? 'no file'}`);
    return new Uint8Array(await data.arrayBuffer());
  };

  const downloadOne = async (r: Row) => {
    setBusy(r.id);
    try {
      save(r.file_path.split('/').pop()!, await fetchZip(r));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const downloadAll = async () => {
    if (!rows?.length) return;
    setBusy('all');
    try {
      const files: Record<string, Uint8Array> = {};
      for (const r of rows) files[`sessions/${r.file_path.split('/').pop()!}`] = await fetchZip(r);
      save(`study_sessions_${new Date().toISOString().slice(0, 10)}.zip`, zipFiles(files));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <header className="bg-[color:var(--color-header)] text-white">
        <div className="mx-auto flex min-h-12 max-w-6xl items-center gap-3 px-5">
          <span className="font-semibold">REAL</span>
          <span className="text-sm opacity-80">study sessions (researchers only)</span>
          {session ? (
            <button
              type="button"
              className="ml-auto text-sm underline"
              onClick={() => void db!.auth.signOut().then(() => setRows(null))}
            >
              Sign out
            </button>
          ) : null}
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8">
        {!db ? (
          <Notice tone="refusal" title="Not set up">
            This site was built without online storage (VITE_SUPABASE_URL / VITE_SUPABASE_KEY).
          </Notice>
        ) : !session ? (
          <form
            className="card mx-auto flex w-full max-w-md flex-col gap-4 p-6"
            onSubmit={(e) => {
              e.preventDefault();
              setBusy('signin');
              setError(null);
              void db.auth
                .signInWithPassword({ email, password })
                .then(({ error: err }) => err && setError(err.message))
                .finally(() => setBusy(null));
            }}
          >
            <h1 className="text-xl font-semibold">Sign in</h1>
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <Button variant="primary" type="submit" busy={busy === 'signin'}>
              Sign in
            </Button>
            {error ? (
              <p className="text-sm text-[color:var(--color-accent-secondary)]">{error}</p>
            ) : null}
          </form>
        ) : (
          <>
            <Instructions
              page
              cta="Press Download all to get every session in one zip, ready for the analysis."
            >
              <p>
                Every session a participant signed, newest first. Each one is the zip the
                participant also downloaded: decisions.json, R0.dsl, R1.dsl, requirement_diff.md and
                log.jsonl.
              </p>
            </Instructions>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold">
                {rows ? `${rows.length} session${rows.length === 1 ? '' : 's'}` : 'Loading…'}
              </h1>
              <Button variant="secondary" onClick={() => void load()}>
                Refresh
              </Button>
              <Button
                variant="primary"
                className="ml-auto"
                disabled={!rows?.length}
                busy={busy === 'all'}
                onClick={() => void downloadAll()}
              >
                Download all
              </Button>
            </div>
            {error ? (
              <Notice tone="refusal" title="Problem">
                {error}
              </Notice>
            ) : null}
            {rows?.length ? (
              <div className="card overflow-x-auto p-0">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border text-xs text-text-muted">
                    <tr>
                      {['Participant', 'Expertise', 'Car', 'Signed', 'Minutes', 'Size', ''].map(
                        (h) => (
                          <th key={h} className="px-4 py-2 font-medium">
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2 font-mono">{r.participant}</td>
                        <td className="px-4 py-2">{r.expertise}</td>
                        <td className="px-4 py-2 font-mono">{r.car}</td>
                        <td className="px-4 py-2">
                          {r.signed_at ? displayDate(r.signed_at) : '—'}
                        </td>
                        <td className="num px-4 py-2">
                          {minutes(r.started_at, r.signed_at) ?? '—'}
                        </td>
                        <td className="num px-4 py-2">{Math.round(r.size_bytes / 1024)} KB</td>
                        <td className="px-4 py-2 text-right">
                          <Button
                            size="sm"
                            busy={busy === r.id}
                            onClick={() => void downloadOne(r)}
                          >
                            Download
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : rows ? (
              <p className="text-sm text-text-muted">No session yet.</p>
            ) : null}
          </>
        )}
      </main>
    </>
  );
}
