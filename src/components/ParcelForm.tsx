import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package } from "lucide-react";

export type ParcelDetails = {
  sender_name: string;
  sender_phone: string;
  receiver_name: string;
  receiver_phone: string;
  item_description: string;
};

export function ParcelForm({
  value,
  onChange,
}: {
  value: ParcelDetails;
  onChange: (v: ParcelDetails) => void;
}) {
  const set = (k: keyof ParcelDetails) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [k]: e.target.value });

  return (
    <div className="space-y-2 bg-muted/40 rounded-xl p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Package className="h-4 w-4" /> Parcel details · பார்சல் விவரம்
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[11px]">Sender name</Label>
          <Input value={value.sender_name} onChange={set("sender_name")} placeholder="Your name" className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Sender phone</Label>
          <Input value={value.sender_phone} onChange={set("sender_phone")} placeholder="9XXXXXXXXX" className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Receiver name</Label>
          <Input value={value.receiver_name} onChange={set("receiver_name")} placeholder="Receiver" className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Receiver phone</Label>
          <Input value={value.receiver_phone} onChange={set("receiver_phone")} placeholder="9XXXXXXXXX" className="h-9" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-[11px]">Item description</Label>
        <Input
          value={value.item_description}
          onChange={set("item_description")}
          placeholder="Documents, food, small box..."
          className="h-9"
        />
      </div>
    </div>
  );
}

export function isParcelValid(p: ParcelDetails) {
  return (
    p.sender_name.trim().length > 1 &&
    /^\d{10}$/.test(p.sender_phone.trim()) &&
    p.receiver_name.trim().length > 1 &&
    /^\d{10}$/.test(p.receiver_phone.trim()) &&
    p.item_description.trim().length > 1
  );
}
