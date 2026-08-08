export default function DropdownTrigger({
  value,
  placeholder,
  leadingIcon,
  trailingIcon,
  onClick,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="
        flex
        h-11
        w-full
        items-center
        rounded-md
        border
        border-gray-600
        bg-white
        px-2
        transition-all
        duration-200
        ease-out
        overflow-hidden
        text-sm md:text-base lg:text-md
        hover:border-sky-600
        focus:border-sky-600
        focus:ring-1
        focus:ring-sky-600
        focus:shadow-lg
        cursor-pointer
      "
    >
      {leadingIcon && (
        <span className="flex h-7 w-7 items-center justify-center">
          {leadingIcon}
        </span>
      )}

      <span className="ml-2 flex-1 text-left">
        {value || (
          <span className="font-light text-zinc-500">{placeholder}</span>
        )}
      </span>

      {trailingIcon && (
        <span className="ml-1 flex items-center">{trailingIcon}</span>
      )}
    </button>
  );
}
