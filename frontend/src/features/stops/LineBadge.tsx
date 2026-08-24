import { Link } from 'react-router';
import { modeLabel, useLocale } from '../../i18n';
import { linePath } from '../../app/routes';
import { ModeIcon } from '../journey/modeIcons';
import { modeVisual } from '../journey/modeVisuals';
import type { GtfsRouteType } from '../../types/journey';

interface Props {
  lineId: string;
  routeShortName: string;
  routeType: GtfsRouteType;
  /** A link to the line's own page, where one is worth offering. */
  linked?: boolean | undefined;
}

/**
 * A line's designation, wearing its mode.
 *
 * The same pairing the itinerary and the map already use — the mode's colour,
 * the mode's silhouette, the operator's number — so somebody who has read one
 * of those does not have to learn this. The mode's *name* rides along for a
 * screen reader, because colour and shape carry nothing to one and "550" alone
 * does not say whether to look for a bus or a train.
 */
export function LineBadge({ lineId, routeShortName, routeType, linked = false }: Props) {
  const { strings } = useLocale();

  const body = (
    <>
      <ModeIcon routeType={routeType} size={16} />
      <span dir="auto">{routeShortName}</span>
      <span className="sr-only">{modeLabel(routeType, strings)}</span>
    </>
  );

  const skin = `${modeVisual(routeType).fill} text-on-mode rounded-control flex flex-none items-center gap-1.5 px-2 py-1 text-sm font-bold tabular-nums`;

  if (!linked) return <span className={skin}>{body}</span>;

  /*
   * No `aria-label`. The accessible name comes from the contents — the
   * designation plus the mode name already inside — because an assembled one
   * would mean gluing translated fragments together, and word order differs
   * between languages.
   */
  return (
    <Link
      to={linePath(lineId)}
      className={`${skin} focus-visible:outline-content hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2`}
    >
      {body}
    </Link>
  );
}
