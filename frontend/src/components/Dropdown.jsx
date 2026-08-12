import { useState, useLayoutEffect } from "react";
import DropdownTrigger from "./DropdownTrigger";

export default function Dropdown({
  value,
  placeholder,
  leadingIcon,
  trailingIcon,
  dropdownMenuState,
  innerRef,
  onClick,
  showTrigger = true,
  children,
  className = "",
}) {
  useLayoutEffect(() => {
    if (dropdownMenuState && innerRef.current) {
      const listContainer = innerRef.current.querySelector("ul");

      const targetItem =
        listContainer?.querySelector('[data-selected="true"]') ||
        listContainer?.querySelector('[data-anchor="true"]');

      if (listContainer && targetItem) {
        const containerHalfHeight = listContainer.clientHeight / 2;
        const itemHalfHeight = targetItem.clientHeight / 2;

        listContainer.scrollTop =
          targetItem.offsetTop - containerHalfHeight + itemHalfHeight;
      }
    }
  }, [dropdownMenuState, innerRef]);
  return (
    <div ref={innerRef} className={`relative ${className}`}>
      {showTrigger && (
        <DropdownTrigger
          value={value}
          placeholder={placeholder}
          leadingIcon={leadingIcon}
          trailingIcon={trailingIcon}
          open={dropdownMenuState}
          onClick={onClick}
        />
      )}

      <ul
        className={`
    absolute z-20 mt-1
    w-full
    max-h-50
    overflow-y-auto
    rounded-md
    border border-gray-600
    bg-white
    shadow-lg
    text-sm md:text-base
    transition-all
    duration-250
    ease-out
    origin-top
    ${
      dropdownMenuState
        ? "opacity-100 scale-y-100"
        : "opacity-0 scale-y-0 pointer-events-none"
    }
  `}
      >
        {children}
      </ul>
    </div>
  );
}
