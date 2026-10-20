import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { youtubeEmbed } from '@/config/help';
import { VideoDialog } from '@/pages/OverviewPage';

describe('the help video', () => {
  it('turns any YouTube link into its embedded player', () => {
    const player = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0';
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ?si=abc',
      'https://youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    ])
      expect(youtubeEmbed(url)).toBe(player);
    expect(youtubeEmbed('https://example.org/intro.mp4')).toBeNull();
    expect(youtubeEmbed('not a link')).toBeNull();
  });

  it('plays in a pop-up on the page, closed by Escape or the ×', () => {
    const onClose = vi.fn();
    render(<VideoDialog url="https://youtu.be/dQw4w9WgXcQ" onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'Introduction video' });
    expect(dialog.querySelector('iframe')?.getAttribute('src')).toMatch(
      /youtube-nocookie\.com\/embed\//,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close the introduction video' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
