import { cn } from "@/lib/utils";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function UserAvatar({
  name,
  color,
  className,
  title,
}: {
  name: string;
  color: string;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title ?? name}
      className={cn(
        "inline-flex size-7 shrink-0 select-none items-center justify-center rounded-full text-[11px] font-semibold text-white",
        className
      )}
      style={{ backgroundColor: color }}
    >
      {initials(name)}
    </span>
  );
}
