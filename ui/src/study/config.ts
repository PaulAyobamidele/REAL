/**
 * The study build (VITE_STUDY=1): the normal tool for one participant, its
 * runs replayed from pre-computed results (docs/design/study_mode_brief.md).
 */
export const STUDY = (import.meta.env?.VITE_STUDY as string | undefined) === '1';

/** The build, recorded in every study file. */
export const BUILD = (import.meta.env?.VITE_BUILD as string | undefined) ?? 'dev';
