import { useLocale } from '../../i18n';
import { openNotice } from './noticeStore';

/**
 * Reopens the independence notice. Shaped like the tour button beside it.
 *
 * `onOpen` lets the mobile menu close itself first, as the tour button does.
 */
export function NoticeButton({ onOpen }: { onOpen?: (() => void) | undefined }) {
  const { strings, t } = useLocale();

  return (
    <button
      type="button"
      onClick={() => {
        onOpen?.();
        openNotice();
      }}
      aria-label={t(strings.notice.open)}
      className="rounded-control border-chrome-border text-on-chrome focus-visible:outline-on-chrome inline-flex h-9 cursor-pointer items-center gap-1.5 border px-2.5 text-sm leading-none focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <svg
        viewBox="0 0 20 20"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="10" cy="10" r="7.5" />
        <path d="M10 9.2v4.6" />
        <circle cx="10" cy="6.4" r=".6" fill="currentColor" stroke="none" />
      </svg>
    </button>
  );
}
