import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="text-lg font-semibold">Nicht gefunden</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Diese Seite existiert nicht oder du hast keinen Zugriff darauf.
      </p>
      <Button asChild variant="outline" size="sm">
        <Link href="/projects">Zu den Projekten</Link>
      </Button>
    </div>
  );
}
