const COLORS = [
  "bg-blue-600",
  "bg-indigo-600",
  "bg-violet-600",
  "bg-emerald-600",
  "bg-teal-600",
  "bg-rose-600",
  "bg-orange-600",
  "bg-cyan-700",
];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function avatarColor(name: string): string {
  // FNV-1a style hash, kept within 32 bits so the colour is stable for any name length.
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return COLORS[(hash >>> 0) % COLORS.length]!;
}
