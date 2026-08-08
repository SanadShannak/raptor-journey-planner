import { ChevronDown } from "lucide-react";

export default function IconChevron({
  className = "",
  chevronState,
  ...props
}) {
  const combinedClassName = `
    ${className}
    transition-transform
    duration-250
    ease-out
    ${chevronState ? "rotate-90" : "rotate-0"}
  `;

  return <ChevronDown {...props} className={combinedClassName} />;
}
