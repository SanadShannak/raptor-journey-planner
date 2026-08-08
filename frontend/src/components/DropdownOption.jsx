export default function DropdownOption({
  value,
  leadingIcon,
  trailingIcon,
  onClick,
  isSelected,
  isAnchor,
}) {
  return (
    <li data-selected={isSelected} data-anchor={isAnchor}>
      <button
        type="button"
        onClick={() => onClick(value)}
        className={`
          flex
          h-11
          w-full
          items-center
          px-3
          transition-colors
          hover:bg-gray-100
          cursor-pointer
        text-sm md:text-base lg:text-md
        ${isSelected ? "bg-sky-100 text-sky-700 font-medium" : "text-gray-700"}
        `}
      >
        {leadingIcon && (
          <span className="mr-2 flex items-center">{leadingIcon}</span>
        )}

        <span className="flex-1 text-left">{value}</span>

        {trailingIcon && (
          <span className="ml-2 flex items-center">{trailingIcon}</span>
        )}
      </button>
    </li>
  );
}
