import { useLocale } from '../i18n';

/**
 * Said once, at the bottom of a sidebar that shows a schedule-derived time or
 * a vehicle's position — a stop's board, a route's stops or timetable, the
 * planner's results list, or an open itinerary.
 *
 * One component rather than the same className string copied into each of
 * those, because "the same style everywhere" is exactly the property that
 * copies drift out of the first time one of them is touched on its own.
 *
 * Last in the content rather than pinned to the foot of the viewport: these
 * sidebars scroll as a pane on the desktop layout and as the page itself on a
 * phone, and a sticky footer would sit over whichever one is currently
 * showing rather than reading as part of what it is annotating.
 */
export function ScheduleEstimateNotice() {
  const { t, strings } = useLocale();

  return (
    <p className="text-content-muted border-border mt-2 border-t pt-3 text-xs">
      {t(strings.common.scheduleEstimateNotice)}
    </p>
  );
}
