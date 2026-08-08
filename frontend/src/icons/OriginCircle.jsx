import { Circle } from "lucide-react";

export default function IconOriginCircle({
  className = "",
  innerCircleSize = "size-1 md:size-2.5",
  ...props
}) {
  const combinedClassName = `fill-[#4FA701] ${className}`;
  return (
    <div className="relative">
      <Circle {...props} className={combinedClassName} />
      <Circle
        strokeWidth={0}
        className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 fill-white ${innerCircleSize}`}
      />
    </div>
  );
}
