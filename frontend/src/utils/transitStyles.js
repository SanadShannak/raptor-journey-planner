import IconWait from "../icons/Wait";
import WalkingSpeed from "../icons/Walking";
import IconBus from "../icons/Bus";
import IconTram from "../icons/Tram";
import IconMetro from "../icons/Metro";
import IconFerry from "../icons/Ferry";
import IconTrain from "../icons/Train";

export const getWaitConfig = () => {
  return {
    bgColor: "bg-white",
    border: "border border-gray-300",
    icon: IconWait,
    iconColor: "text-[#333333]",
    textColor: "text-[#333333]",
  };
};

export const getTransportModeConfig = (leg) => {
  if (leg.mode === "WALK") {
    return {
      bgColor: "bg-[#DDDDDD]",
      border: "border border-transparent",
      icon: WalkingSpeed,
      iconColor: "text-[#333333]",
      textColor: "text-[#333333]",
    };
  }

  switch (Number(leg.routeType)) {
    case 0: // Tram
      return {
        bgColor: "bg-[#028151]",
        border: "border border-transparent",
        icon: IconTram,
        iconColor: "text-white",
        textColor: "text-white",
      };
    case 1: // Metro
      return {
        bgColor: "bg-[#CA4100]",
        border: "border border-transparent",
        icon: IconMetro,
        iconColor: "text-white",
        textColor: "text-white",
      };
    case 2: // Train
      return {
        bgColor: "bg-[#8C4799]",
        border: "border border-transparent",
        icon: IconTrain,
        iconColor: "text-white",
        textColor: "text-white",
      };
    case 4: // Ferry
      return {
        bgColor: "bg-[#007A97]",
        border: "border border-transparent",
        icon: IconFerry,
        iconColor: "text-white",
        textColor: "text-white",
      };
    case 3: // Bus
    default:
      return {
        bgColor: "bg-[#0074C0]",
        border: "border border-transparent",
        icon: IconBus,
        iconColor: "text-white",
        textColor: "text-white",
      };
  }
};
