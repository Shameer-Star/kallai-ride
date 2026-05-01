import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export function OtpInput({
  value,
  onChange,
  onComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
}) {
  return (
    <InputOTP
      maxLength={4}
      value={value}
      onChange={(v) => {
        onChange(v);
        if (v.length === 4) onComplete?.(v);
      }}
    >
      <InputOTPGroup>
        <InputOTPSlot index={0} className="h-14 w-14 text-2xl font-bold" />
        <InputOTPSlot index={1} className="h-14 w-14 text-2xl font-bold" />
        <InputOTPSlot index={2} className="h-14 w-14 text-2xl font-bold" />
        <InputOTPSlot index={3} className="h-14 w-14 text-2xl font-bold" />
      </InputOTPGroup>
    </InputOTP>
  );
}
