/** The header on the study's start and thank-you screens: the same band as on every other page. */
export function StudyHeader({ participant }: { participant?: string }) {
  return (
    <header className="app-header sticky top-0 z-30">
      <div className="mx-auto flex min-h-12 max-w-[80rem] items-center gap-5 px-5 py-2 lg:px-8">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-tight text-white">
          <span aria-hidden="true" className="inline-block size-5 rounded-md bg-header-marker" />
          REAL
        </span>
        {participant ? (
          <span className="ml-auto text-xs text-white">
            Participant <span className="font-mono font-semibold">{participant}</span>
          </span>
        ) : null}
      </div>
    </header>
  );
}
