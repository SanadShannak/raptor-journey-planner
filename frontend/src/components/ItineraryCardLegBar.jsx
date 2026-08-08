import { useEffect, useRef, useState } from "react";

export default function ItineraryCardLegBar({
  widthPercentage,
  bgColor,
  border,
  icon: Icon,
  iconColor,
  text,
  textColor,
  isTransit,
}) {
  const legBarRef = useRef(null);
  const [showText, setShowText] = useState(true);
  useEffect(() => {
    if (!legBarRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!isTransit && entry.contentRect.width < 45) {
        setShowText(false);
      } else {
        setShowText(true);
      }
    });

    observer.observe(legBarRef.current);
    return () => observer.disconnect();
  }, [isTransit]);
  return (
    <div
      ref={legBarRef}
      style={{ flex: `${widthPercentage} 1 0%` }}
      className={`flex ${bgColor} ${border}  ${showText ? "" : "justify-center"} min-h-4  ${isTransit ? "min-w-max" : "min-w-4"} py-1 px-2  rounded-md items-center gap-2  `}
    >
      {Icon && <Icon className={`${iconColor}  h-5 w-5 shrink-0`} />}

      {showText && <span className={`${textColor} text-md`}>{text}</span>}
    </div>
  );
}
