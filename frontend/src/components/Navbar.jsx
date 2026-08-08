import HslLogo from "../assets/HslLogo";

export default function Navbar() {
  return (
    <header className="h-20 w-full flex items-center justify-between px-6 shadow-md z-20 bg-sky-600 ">
      <div className="flex items-center">
        <HslLogo className="h-10 text-white fill-current" />
      </div>
    </header>
  );
}
