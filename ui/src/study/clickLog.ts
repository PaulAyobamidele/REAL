import { logEvent } from './log';

/**
 * Evidence opened (brief 4.5: a trace, a table filter, a map cluster, an
 * obstacle, a fold): every click on something interactive goes into the log
 * with what it was and where, so a session can be followed step by step.
 */
const INTERACTIVE =
  'button, a, summary, [role="button"], [role="radio"], [role="tab"], [role="option"], [role="row"], [role="link"], [tabindex]';

export function describeClick(el: Element): string {
  const role = el.getAttribute('role');
  const label =
    el.getAttribute('aria-label') ??
    el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 100) ??
    '';
  return `${el.tagName.toLowerCase()}${role ? `[${role}]` : ''}: ${label}`;
}

export function installClickLog(): () => void {
  const onClick = (e: MouseEvent) => {
    const el = (e.target as Element | null)?.closest?.(INTERACTIVE);
    if (!el || el.closest('textarea, input, select')) return;
    logEvent({
      screen: window.location.hash.replace(/^#\/?/, '') || 'workspace',
      event: 'clicked',
      target: describeClick(el),
    });
  };
  document.addEventListener('click', onClick, true);
  return () => document.removeEventListener('click', onClick, true);
}
