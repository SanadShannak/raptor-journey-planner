export default function Input({
  inputValue,
  trailingIcon,
  leadingIcon,
  onChange,
  onClear,
  placeholderText = "",
  className = "",
  ...props
}) {
  return (
    <div
      className={`}relative h-10 md:h-11 bg-white flex w-full px-2 items-center border border-gray-600 rounded-md focus-within:border-sky-600
        focus-within:ring-1
        focus-within:ring-sky-600
        focus-within:shadow-lg transition-all duration-200 ease-out overflow-hidden ${className}`}
    >
      {leadingIcon && <span className="flex items-center">{leadingIcon}</span>}
      <input
        type="text"
        placeholder={placeholderText}
        value={inputValue}
        onChange={onChange}
        className="h-full flex-1 min-w-0 pl-2 focus:outline-none placeholder:text-sm
md:placeholder:text-base placeholder:text-zinc-500 placeholder:font-light"
        {...props}
      />
      {trailingIcon && inputValue && (
        <button
          type="button"
          onClick={onClear}
          className="flex items-center justify-center cursor-pointer rounded-full transition-colors hover:bg-gray-300"
        >
          {trailingIcon}
        </button>
      )}
    </div>
  );
}
