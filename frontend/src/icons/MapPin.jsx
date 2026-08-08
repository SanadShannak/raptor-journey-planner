import { MapPin } from "lucide-react";

export default function IconMapPin({ className = "", ...props }) {
  const combinedClassName = `fill-[#EC5188] ${className}`;
  return <MapPin {...props} className={combinedClassName} />;
}
