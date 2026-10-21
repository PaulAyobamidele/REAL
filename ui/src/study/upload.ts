import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { StudySession } from './session';
import { zipFiles } from './zip';

/**
 * The study's online storage (Supabase; docs/study/supabase_setup.sql): at
 * signing the participant's zip is sent there as well as downloaded. The page
 * holds only the publishable key, so the storage lets anyone add a session and
 * nothing else; only the researcher, signed in on the admin page, reads them.
 * Without VITE_SUPABASE_URL / VITE_SUPABASE_KEY at build time nothing is sent,
 * and the zip goes to the researcher by hand, as before.
 */
const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY_ = import.meta.env.VITE_SUPABASE_KEY as string | undefined;

// never under test: the tests must not reach the real storage
export const uploadConfigured = Boolean(URL_ && KEY_) && import.meta.env.MODE !== 'test';
export const BUCKET = 'sessions';

let anon: SupabaseClient | null = null;
/** The participant's client: no sign-in, nothing kept in the browser. */
function client(): SupabaseClient {
  anon ??= createClient(URL_!, KEY_!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return anon;
}

/** The researcher's client on the admin page: the sign-in is kept in this browser. */
export function adminClient(): SupabaseClient | null {
  if (!uploadConfigured) return null;
  return createClient(URL_!, KEY_!, {
    auth: { persistSession: true, storageKey: 'real-av.admin' },
  });
}

/** Where a session's zip is stored: its own folder, stamped, so nothing is overwritten. */
export function storagePath(participant: string, at: Date): string {
  const stamp = at.toISOString().replace(/[-:]/g, '').slice(0, 15); // 20261020T101008
  return `${participant}/study_${participant}_${stamp}.zip`;
}

export type UploadResult = { ok: true; path: string } | { ok: false; message: string };

export async function uploadSession(input: {
  session: StudySession;
  car: string;
  signedAt: string;
  files: Record<string, string>;
}): Promise<UploadResult> {
  if (!uploadConfigured)
    return { ok: false, message: 'online storage is not set up for this site' };
  const bytes = zipFiles(input.files);
  const path = storagePath(input.session.id, new Date());
  try {
    const db = client();
    const up = await db.storage
      .from(BUCKET)
      .upload(path, new Blob([bytes], { type: 'application/zip' }), {
        contentType: 'application/zip',
        upsert: false,
      });
    if (up.error) return { ok: false, message: up.error.message };
    const row = await db.from('submissions').insert({
      participant: input.session.id,
      expertise: input.session.expertise.slice(0, 200),
      car: input.car,
      started_at: input.session.started_at,
      signed_at: input.signedAt,
      build: input.session.build.slice(0, 80),
      file_path: path,
      size_bytes: bytes.length,
    });
    if (row.error) return { ok: false, message: row.error.message };
    return { ok: true, path };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
