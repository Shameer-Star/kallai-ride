export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const height = size === "lg" ? "h-12" : size === "sm" ? "h-6.5" : "h-9";
  const textClass = size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-xl";
  
  return (
    <div className="flex items-center gap-2 select-none">
      <div className={`relative ${height} aspect-square flex items-center justify-center bg-primary rounded-xl overflow-hidden shadow-md group hover:scale-105 transition-all duration-300 cursor-pointer`}>
        <div className="absolute inset-0 bg-gradient-to-tr from-yellow-400 to-primary opacity-20 animate-pulse" />
        <span className="text-white text-base font-black tracking-tighter animate-bounce select-none">A</span>
      </div>
      <span className={`font-black tracking-tight ${textClass} bg-gradient-to-r from-primary to-yellow-500 bg-clip-text text-transparent hover:brightness-110 transition-all duration-300`}>
        Adhaiyur Ride
      </span>
    </div>
  );
}
