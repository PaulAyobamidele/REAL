/**
 * The instructional video on the Overview page (both builds). Set it here, or
 * at build time with VITE_HELP_VIDEO_URL. It plays in a pop-up on the page.
 * Empty: the card has no play button.
 */
export const HELP_VIDEO_URL: string =
  (import.meta.env?.VITE_HELP_VIDEO_URL as string | undefined) ?? '';

/**
 * The embeddable player for a YouTube link (watch?v=, youtu.be/, shorts/,
 * embed/), or null for any other link, which plays as a video file.
 */
export function youtubeEmbed(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www\.|m\.)/, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0] || null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [kind, value] = u.pathname.split('/').filter(Boolean);
    id =
      kind === 'watch'
        ? u.searchParams.get('v')
        : kind && ['embed', 'shorts'].includes(kind)
          ? (value ?? null)
          : null;
  }
  if (!id || !/^[\w-]{6,}$/.test(id)) return null;
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
}
