import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppMark } from '../../components/AppMark';
import { LegalLinks } from '../../components/LegalLinks';
import { LanguageToggle, useLocale } from '../../i18n';
import { useReducedMotion } from '../../map/useReducedMotion';
import { closeNotice, getNoticeState, subscribeToNotice } from './noticeStore';

const HOLD_SECONDS = 4;
/** How long the way out takes: `--animate-splash-out` in `index.css`. */
const CLOSE_MS = 450;

/** Draws the independence notice when it is open. Mounted once, in the layout. */
export function NoticeHost() {
  const { open, hold } = useSyncExternalStore(subscribeToNotice, getNoticeState);
  if (!open) return null;
  return <NoticeDialog hold={hold} />;
}

/**
 * A full-window start screen on the brand colour, the way a phone app opens.
 *
 * Still a native modal `<dialog>`, like the other dialogs, for the page behind
 * it to be inert and for Escape to arrive as a `cancel` event. It closes through
 * `dialog.close()` rather than by being unmounted, because that is what returns
 * focus to the control that opened it.
 *
 * **On a page load the backdrop is the page's own ground**, solid, so the screen
 * can fade in without the app showing through it. It turns transparent as the
 * screen leaves, which is when the app is meant to appear. Reopened from the
 * header there is a page to fade in over, so the backdrop stays clear.
 *
 * The way out is a timer rather than `animationend`, which never fires with the
 * animation off or the tab hidden and would leave the screen stuck open.
 *
 * The button is `aria-disabled` while holding, not `disabled`. A disabled
 * button cannot hold focus, so `showModal()` would have nowhere to put it and a
 * keyboard user would have to find the button once the hold ended.
 */
function NoticeDialog({ hold }: { hold: boolean }) {
  const { strings, t } = useLocale();
  const reduced = useReducedMotion();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();

  const [secondsLeft, setSecondsLeft] = useState(hold ? HOLD_SECONDS : 0);
  const [leaving, setLeaving] = useState(false);
  const holding = secondsLeft > 0;

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog !== null && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    if (secondsLeft === 0) return;
    const timer = window.setTimeout(() => setSecondsLeft(secondsLeft - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft]);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => dialogRef.current?.close(), CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  const leave = () => {
    if (holding) return;
    if (reduced) dialogRef.current?.close();
    else setLeaving(true);
  };

  /* Each group rises a beat after the last, and all leave together. */
  const rise = (delay: string) =>
    leaving ? 'motion-safe:animate-splash-lift' : `motion-safe:animate-splash-rise ${delay}`;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(event) => {
        // Escape takes the same way out as the button, or waits with it.
        event.preventDefault();
        leave();
      }}
      onClose={() => {
        /*
         * Chrome lets a second Escape close a dialog whose `cancel` was refused,
         * without asking again, so the hold is put back here.
         */
        if (holding) dialogRef.current?.showModal();
        else closeNotice();
      }}
      className={`bg-chrome text-on-chrome fixed inset-0 m-0 h-full max-h-none w-full max-w-none overflow-y-auto overflow-x-hidden border-0 p-0 ${
        hold && !leaving ? 'backdrop:bg-surface' : 'backdrop:bg-transparent'
      } ${leaving ? 'motion-safe:animate-splash-out' : 'motion-safe:animate-splash-in'}`}
    >
      {/* `min-h-full`, so a short screen scrolls instead of cutting off the button. */}
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col items-center justify-center gap-6 px-6 pt-16 pb-10 text-center">
        <div className={`flex flex-col items-center gap-6 ${rise('[animation-delay:100ms]')}`}>
          <AppMark size={84} />
          <p className="text-xl font-semibold tracking-tight">{t(strings.app.title)}</p>
        </div>

        <div className={`flex flex-col gap-4 ${rise('[animation-delay:200ms]')}`}>
          <h2 id={titleId} className="text-2xl font-semibold text-balance">
            {t(strings.notice.title)}
          </h2>

          <div id={bodyId} className="flex flex-col gap-3 text-pretty">
            <p>{t(strings.notice.independence)}</p>
            <p className="text-sm">{t(strings.notice.accuracy)}</p>
          </div>
        </div>

        <button
          type="button"
          aria-disabled={holding || undefined}
          onClick={leave}
          className={`rounded-control focus-visible:outline-on-chrome w-full border px-4 py-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-colors motion-safe:duration-300 ${rise('[animation-delay:300ms]')} ${
            holding
              ? 'border-chrome-border text-on-chrome cursor-not-allowed tabular-nums'
              : 'bg-on-chrome text-chrome border-transparent cursor-pointer'
          }`}
        >
          {holding ? (
            <>
              {/* The count is for the eye; a screen reader is not read each second. */}
              <span className="sr-only">{t(strings.notice.acknowledge)}</span>
              <span aria-hidden="true">
                {t(strings.notice.acknowledgeIn, { seconds: secondsLeft })}
              </span>
            </>
          ) : (
            t(strings.notice.acknowledge)
          )}
        </button>

        {/*
          Held back with the button, so they are not a way past the hold. Always
          taking up their space, so the screen does not jump when they appear.
        */}
        <div className={`text-sm ${holding ? 'invisible' : ''} ${rise('[animation-delay:300ms]')}`}>
          <LegalLinks
            onNavigate={leave}
            className="rounded-control focus-visible:outline-on-chrome underline focus-visible:outline-2 focus-visible:outline-offset-2"
          />
        </div>
      </div>

      {/*
        After the button in the document, though at the top of the screen, so
        `showModal()` puts focus on the button and Enter does not change the
        language by accident.
      */}
      <div className="absolute end-4 top-4">
        <LanguageToggle />
      </div>
    </dialog>
  );
}
