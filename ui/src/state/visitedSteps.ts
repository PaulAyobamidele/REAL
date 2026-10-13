import { useEffect, useState } from 'react';

/**
 * The review steps a reviewer has opened for a run, so the reading steps
 * (1-3) count as done once seen. Kept for the browser session; when session
 * storage is unavailable it lasts as long as the page.
 */
const memory = new Map<string, Set<number>>();
const key = (runId: string) => `real-av.visited.${runId}`;

function read(runId: string): Set<number> {
  try {
    const raw = window.sessionStorage.getItem(key(runId));
    if (raw) return new Set((JSON.parse(raw) as number[]).filter(Number.isInteger));
  } catch {
    // unavailable or unreadable: fall back to the page's memory
  }
  return new Set(memory.get(runId) ?? []);
}

function write(runId: string, steps: Set<number>): void {
  memory.set(runId, steps);
  try {
    window.sessionStorage.setItem(key(runId), JSON.stringify([...steps]));
  } catch {
    // the page's memory keeps it
  }
}

export function useVisitedSteps(runId: string, step: number): ReadonlySet<number> {
  const [visited, setVisited] = useState<Set<number>>(() => read(runId));
  useEffect(() => {
    const next = read(runId);
    if (!next.has(step)) {
      next.add(step);
      write(runId, next);
    }
    setVisited(next);
  }, [runId, step]);
  return visited;
}
