import { replaceModule } from '@/domain/requirementText';
import type { Change, DecisionsDoc } from '@/services/schemas';

import type { StudyChoice, StudyMitigation } from './menu';

/**
 * The car a participant's decisions make. The car changes on the study menu
 * add up across obstacles (path-aware braking on one, the larger detector on
 * another = both); the result is always one of the four cars with a
 * pre-computed run, so R1 can be "run" in the study.
 */
export const CARS = {
  C1: { braking: 'proportional_braking', perception: 'yolov5s' },
  C2: { braking: 'path_aware_braking', perception: 'yolov5s' },
  C3: { braking: 'proportional_braking', perception: 'yolov5m' },
  C4: { braking: 'path_aware_braking', perception: 'yolov5m' },
} as const;
export type CarId = keyof typeof CARS;

/** The tasks of the study requirement whose `performed by` module a car change swaps. */
export const BRAKING_TASK = 'Apply Brakes';
export const PERCEPTION_TASK = 'Detect Pedestrian';

const PATH_AWARE: StudyChoice[] = ['car_path_aware', 'car_both'];
const LARGER: StudyChoice[] = ['car_larger_detector', 'car_both'];

function chosen(doc: DecisionsDoc, choices: StudyChoice[]): string[] {
  return Object.entries(doc.obstacles)
    .filter(([, o]) => {
      const c = (o.mitigation as StudyMitigation | null)?.choice;
      return (o.verdict === 'accept' || o.verdict === 'rename') && c && choices.includes(c);
    })
    .map(([id]) => id);
}

export function carOf(doc: DecisionsDoc): {
  id: CarId;
  pathAwareFrom: string[];
  largerFrom: string[];
} {
  const pathAwareFrom = chosen(doc, PATH_AWARE);
  const largerFrom = chosen(doc, LARGER);
  const id: CarId = pathAwareFrom.length
    ? largerFrom.length
      ? 'C4'
      : 'C2'
    : largerFrom.length
      ? 'C3'
      : 'C1';
  return { id, pathAwareFrom, largerFrom };
}

/** The [S] changes R1 gets: one module swap per car change, citing the obstacles that asked for it. */
export function carChanges(doc: DecisionsDoc): Change[] {
  const { pathAwareFrom, largerFrom } = carOf(doc);
  const changes: Change[] = [];
  if (pathAwareFrom.length)
    changes.push({
      kind: 'S',
      from: pathAwareFrom.join(', '),
      layer: 'system',
      task: BRAKING_TASK,
      module: CARS.C2.braking,
      available: true,
      text: `"${BRAKING_TASK}" performed by "${CARS.C2.braking}"`,
    });
  if (largerFrom.length)
    changes.push({
      kind: 'S',
      from: largerFrom.join(', '),
      layer: 'system',
      task: PERCEPTION_TASK,
      module: CARS.C3.perception,
      available: true,
      text: `"${PERCEPTION_TASK}" performed by "${CARS.C3.perception}"`,
    });
  return changes;
}

/** The modules a requirement text names for the two tasks, or null when it does not. */
export function modulesIn(text: string): { braking: string; perception: string } | null {
  try {
    const braking = replaceModule(text, BRAKING_TASK, 'x').previous;
    const perception = replaceModule(text, PERCEPTION_TASK, 'x').previous;
    return { braking, perception };
  } catch {
    return null;
  }
}

/** Which of the four saved cars a requirement text runs, or null (then it cannot be signed). */
export function savedCarOf(text: string): CarId | null {
  const m = modulesIn(text);
  if (!m) return null;
  const hit = (Object.keys(CARS) as CarId[]).find(
    (id) => CARS[id].braking === m.braking && CARS[id].perception === m.perception,
  );
  return hit ?? null;
}
