import { Avatar, AvatarFallback } from '@/components/ui/avatar';

/** Up to two initials from a Vietnamese full name: "Nguyễn Văn An" → "NA". */
export function initials(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? '') : '';
  return (first + last).toLocaleUpperCase('vi-VN');
}

export function UserAvatar({ fullName, className }: { fullName: string; className?: string }) {
  return (
    <Avatar className={className}>
      <AvatarFallback className="bg-primary/10 font-semibold text-primary">
        {initials(fullName)}
      </AvatarFallback>
    </Avatar>
  );
}
