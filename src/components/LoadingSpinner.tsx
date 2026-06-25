import { useEffect, useState } from "react";

interface LoadingSpinnerProps {
  fullScreen?: boolean;
  message?: string;
  messageTa?: string;
}

export function LoadingSpinner({
  fullScreen = true,
  message = "Loading Kallai Rapido",
  messageTa = "வண்டி தயார் செய்யப்படுகிறது...",
}: LoadingSpinnerProps) {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "" : d + "."));
    }, 400);
    return () => clearInterval(interval);
  }, []);

  const containerClasses = fullScreen
    ? "fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-primary/10 via-background to-background backdrop-blur-sm animate-fade-in"
    : "flex flex-col items-center justify-center p-8 w-full h-full min-h-[200px] animate-fade-in";

  return (
    <div className={containerClasses}>
      <div className="relative flex items-center justify-center mb-6">
        {/* Pulsing Outer Ring */}
        <div className="absolute w-28 h-28 rounded-full border-4 border-primary/25 animate-ping duration-1000" />
        
        {/* Rotating Intermediate Ring */}
        <div className="absolute w-24 h-24 rounded-full border-4 border-transparent border-t-primary border-r-primary animate-spin duration-700" />

        {/* Brand Logo in the center */}
        <div className="relative w-16 h-16 rounded-2xl bg-card border-2 shadow-lg flex items-center justify-center p-2 animate-pulse overflow-hidden">
          <img
            src="/logo.png"
            alt="Kallai Rapido Logo"
            className="w-full h-full object-contain"
          />
        </div>
      </div>
      
      {/* Loading Messages */}
      <div className="text-center space-y-1 max-w-[280px]">
        <h3 className="text-base font-extrabold tracking-tight text-foreground flex items-center justify-center">
          <span>{message}</span>
          <span className="w-4 text-left ml-0.5">{dots}</span>
        </h3>
        <p className="text-[11px] text-muted-foreground font-semibold">{messageTa}</p>
      </div>
    </div>
  );
}
