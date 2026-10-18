import type { Mitigation } from '@/services/schemas';

/**
 * The study's mitigation menu (brief 4.6; one choice per accepted obstacle).
 * Each maps to a valid decisions.py layer; `choice` tells the six apart in the
 * participant's decisions.json. The three car changes each have a
 * pre-computed result (C2-C4).
 */
export type StudyChoice =
  'car_path_aware' | 'car_larger_detector' | 'car_both' | 'requirement' | 'assumption' | 'other';

export interface StudyMenuItem {
  choice: StudyChoice;
  layer: string;
  label: string;
  hint: string;
  /** the participant writes the action in their own words */
  ownWords: boolean;
}

export const STUDY_MENU: StudyMenuItem[] = [
  {
    choice: 'car_path_aware',
    layer: 'system',
    label: 'Change the car: path-aware braking',
    hint: 'brakes only for a person in its lane',
    ownWords: false,
  },
  {
    choice: 'car_larger_detector',
    layer: 'system',
    label: 'Change the car: a larger detector',
    hint: 'YOLOv5m',
    ownWords: false,
  },
  {
    choice: 'car_both',
    layer: 'system',
    label: 'Change the car: both',
    hint: 'path-aware braking and the larger detector',
    ownWords: false,
  },
  {
    choice: 'requirement',
    layer: 'requirement',
    label: 'Change the requirement',
    hint: 'what the car promises, in your words',
    ownWords: true,
  },
  {
    choice: 'assumption',
    layer: 'requirement',
    label: 'Change a domain assumption',
    hint: 'done in the assumption decisions below',
    ownWords: false,
  },
  {
    choice: 'other',
    layer: 'data',
    label: 'Something else',
    hint: 'data, model, test or another car change, in your words',
    ownWords: true,
  },
];

/** "Something else": which layer it is, in the participant's terms. */
export const OTHER_LAYERS: [string, string][] = [
  ['data', 'data'],
  ['model', 'model'],
  ['scenario', 'the test'],
  ['system', 'another car change'],
];

export type StudyMitigation = Mitigation & { choice: StudyChoice };

/** The menu as recorded in each obstacle's `options` (the menu offered). */
export function studyOptions(): StudyMitigation[] {
  return STUDY_MENU.map((m) => ({ layer: m.layer, action: m.label, choice: m.choice }));
}
