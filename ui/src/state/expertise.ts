/**
 * The normal tool's user: their expertise, in their own words, from the
 * welcome page. Kept in this browser (prefilled next time) and recorded in
 * decisions.json when they sign (`reviewer_expertise`). The study build keeps
 * its participant's in the study session instead (study/session.ts).
 */
const KEY = 'real.tool.expertise';

export function loadExpertise(): string {
  try {
    return window.localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveExpertise(value: string): void {
  try {
    window.localStorage.setItem(KEY, value);
  } catch {
    // kept for this page only
  }
}
