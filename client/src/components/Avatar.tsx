import { avatarColor, initials } from "../lib/avatar";

interface AvatarProps {
  name: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  xs: "h-5 w-5 text-[9px]",
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
};

export function Avatar({ name, size = "md", className = "" }: AvatarProps) {
  return (
    <div
      title={name}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white ${SIZES[size]} ${avatarColor(name)} ${className}`}
    >
      {initials(name)}
    </div>
  );
}

export function AvatarStack({ names, max = 4 }: { names: string[]; max?: number }) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <div className="flex -space-x-2">
      {shown.map((name) => (
        <Avatar key={name} name={name} size="sm" className="ring-2 ring-white" />
      ))}
      {extra > 0 && (
        <div className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-medium text-zinc-600 ring-2 ring-white">
          +{extra}
        </div>
      )}
    </div>
  );
}
