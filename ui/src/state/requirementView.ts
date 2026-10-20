import { useCallback, useState } from 'react';

import { STUDY } from '@/study/config';

/**
 * Which view of the requirement a screen shows - text, goal tree, or KAOS
 * diagram - remembered per screen across steps and reloads. Kept in this
 * browser only; when storage is unavailable the screen's default is used.
 */
export type RequirementView = 'text' | 'tree' | 'diagram';

const key = (scope: string) => `real-av.requirement-view.${scope}`;

function readView(scope: string, fallback: RequirementView): RequirementView {
  try {
    const v = window.localStorage.getItem(key(scope));
    // the study build offers no tree view (owner, 2026-10-19)
    if (v === 'tree' && STUDY) return fallback === 'tree' ? 'diagram' : fallback;
    return v === 'text' || v === 'tree' || v === 'diagram' ? v : fallback;
  } catch {
    return fallback;
  }
}

export function useRequirementView(
  scope: string,
  fallback: RequirementView,
): [RequirementView, (v: RequirementView) => void] {
  const [view, setView] = useState<RequirementView>(() =>
    readView(scope, STUDY && fallback === 'tree' ? 'diagram' : fallback),
  );
  const set = useCallback(
    (v: RequirementView) => {
      setView(v);
      try {
        window.localStorage.setItem(key(scope), v);
      } catch {
        // a private window or blocked storage: the choice lasts this page only
      }
    },
    [scope],
  );
  return [view, set];
}
