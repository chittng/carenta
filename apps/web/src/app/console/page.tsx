import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Tổng quan' };

// Placeholder until the Console overview (CARENTA-51).
export default function ConsoleHomePage() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold tracking-tight">Tổng quan</h1>
      <p className="text-muted-foreground">Chưa có số liệu để hiển thị.</p>
    </div>
  );
}
