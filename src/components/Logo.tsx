export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const height = size === "lg" ? "h-20" : size === "sm" ? "h-8" : "h-12";
  return (
    <div className="flex items-center gap-2 animate-fade-in">
      <img
        src="/logo.png"
        alt="Kallai Rapido Logo"
        className={`${height} object-contain`}
      />
    </div>
  );
}
