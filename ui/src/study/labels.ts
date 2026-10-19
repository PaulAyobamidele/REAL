import { STUDY } from './config';

/**
 * The requirement page's name. A participant does not write R0, they read it
 * and run it: the study build calls it what it is, the requirement under test
 * (as in "system under test"); the normal tool, where one writes it, keeps
 * "Write a requirement".
 */
export function authorTitle(): string {
  return STUDY ? 'Requirement under Test' : 'Write a requirement';
}
