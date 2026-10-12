import type { ReactNode } from 'react';
import { PageContainer } from './PageContainer';
import { Spinner } from './Pending';

/**
 * What a page reached from an email link is saying: still working, it worked,
 * it did not, or something to do.
 */
export type LinkTone = 'pending' | 'success' | 'danger' | 'info';

/**
 * The frame for the pages an email link opens — confirming an address,
 * choosing a new password.
 *
 * One centred card with a status mark at the top, the same shape as the
 * sign-in prompt in `AccountGate`, so that somebody arriving cold from their
 * inbox sees at a glance whether things went well before reading a word. The
 * mark is decorative (`aria-hidden`): the heading under it says the same
 * thing in words.
 *
 * Two pages share it, which is why it exists — they used to be a plain heading
 * over a line of text and a link, and drifted apart the moment one was
 * touched on its own.
 */
export function LinkPanel({
  tone,
  title,
  children,
}: {
  tone: LinkTone;
  title: string;
  children: ReactNode;
}) {
  return (
    <PageContainer>
      <div className="mx-auto flex w-full max-w-md flex-col">
        <section className="rounded-card border-border bg-surface-raised shadow-card motion-safe:animate-settle-in flex flex-col items-center gap-4 border px-6 py-10 text-center">
          <ToneMark tone={tone} />
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {children}
        </section>
      </div>
    </PageContainer>
  );
}

/**
 * A message that has to stand out from the text around it: an error, or the
 * one fact somebody must not miss.
 *
 * A bordered box with a mark, rather than red text. Colour alone is how the
 * old pages said "this went wrong", which is no use to anybody who does not
 * see the colour — the mark and the box say it too. The text itself stays in
 * the normal content colour, which reads better at length than red does.
 */
export function Notice({ tone, children }: { tone: 'danger' | 'info'; children: ReactNode }) {
  return (
    <div
      className={`rounded-control bg-surface flex w-full items-start gap-3 border border-s-4 px-4 py-3 text-start text-sm ${
        tone === 'danger' ? 'border-danger' : 'border-border-strong'
      }`}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 flex-none ${tone === 'danger' ? 'text-danger' : 'text-brand-500'}`}
      >
        {tone === 'danger' ? <AlertGlyph size={18} /> : <InfoGlyph size={18} />}
      </span>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

/** The main action on these pages, as a button or as a link styled like one. */
export const PRIMARY_ACTION =
  'rounded-control bg-action text-on-action hover:bg-action-hover hover:text-on-action-hover focus-visible:outline-brand-500 inline-flex cursor-pointer items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2';

function ToneMark({ tone }: { tone: LinkTone }) {
  const colours =
    tone === 'success'
      ? 'bg-surface-muted text-success'
      : tone === 'danger'
        ? 'bg-surface-muted text-danger'
        : 'bg-brand-50 text-brand-700';

  return (
    <span
      aria-hidden="true"
      className={`flex size-14 flex-none items-center justify-center rounded-full text-[28px] ${colours}`}
    >
      {tone === 'pending' ? (
        <Spinner />
      ) : tone === 'success' ? (
        <CheckGlyph />
      ) : tone === 'danger' ? (
        <AlertGlyph size={28} />
      ) : (
        <KeyGlyph />
      )}
    </span>
  );
}

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function CheckGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" {...STROKE}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function AlertGlyph({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...STROKE}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5" />
      <path d="M12 16.5h.01" />
    </svg>
  );
}

function InfoGlyph({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...STROKE}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <path d="M12 7.5h.01" />
    </svg>
  );
}

function KeyGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" {...STROKE}>
      <circle cx="8" cy="15" r="4" />
      <path d="M10.85 12.15L19 4" />
      <path d="M16 7l2.5 2.5" />
      <path d="M14 9l1.5 1.5" />
    </svg>
  );
}
