import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { OBSTACLE_OPTIONS } from '@/components/review/DecisionCards';
import { VerdictControl } from '@/components/review/VerdictControl';

describe('VerdictControl: the three states are told apart in words', () => {
  it('is a labelled radio group with a caption per option', () => {
    render(
      <VerdictControl
        legend="Verdict"
        options={OBSTACLE_OPTIONS}
        value={null}
        state="empty"
        prefill={null}
        onChange={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByRole('radiogroup', { name: /Verdict/ })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.getByText('real obstacle - act on it')).toBeInTheDocument();
    expect(screen.queryByText(/pre-filled/)).not.toBeInTheDocument();
    expect(screen.queryByText(/your verdict/)).not.toBeInTheDocument();
  });

  it('shows a pre-filled tool proposal as not yet confirmed, and confirms on request', async () => {
    const onConfirm = vi.fn();
    const onChange = vi.fn();
    render(
      <VerdictControl
        legend="Verdict"
        options={OBSTACLE_OPTIONS}
        value="accept"
        state="prefilled"
        prefill={{ reviewer: 'tool', decidedAt: '2026-09-23T22:40:10+00:00', toolProposal: true }}
        onChange={onChange}
        onConfirm={onConfirm}
      />,
    );
    expect(
      screen.getByText(/pre-filled: proposed by the tool \(tool\), not yet confirmed/),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /accept/ })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('button', { name: /Confirm as my verdict/ }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('radio', { name: /reject/ }));
    expect(onChange).toHaveBeenCalledWith('reject');
  });

  it('names an earlier human signature as the source of a pre-filled verdict', () => {
    render(
      <VerdictControl
        legend="Verdict"
        options={OBSTACLE_OPTIONS}
        value="defer"
        state="prefilled"
        prefill={{
          reviewer: 'R. Viewer',
          decidedAt: '2026-09-23T22:40:10+00:00',
          toolProposal: false,
        }}
        onChange={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(
      screen.getByText(/signed by R\. Viewer on .*, not yet confirmed by you/),
    ).toBeInTheDocument();
  });

  it('marks a confirmed verdict as the reviewer’s own, with no confirm button', () => {
    render(
      <VerdictControl
        legend="Verdict"
        options={OBSTACLE_OPTIONS}
        value="reject"
        state="confirmed"
        prefill={null}
        onChange={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText(/your verdict/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Confirm/ })).not.toBeInTheDocument();
  });
});
