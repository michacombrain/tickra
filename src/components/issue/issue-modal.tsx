"use client";

import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export function IssueModal({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <Dialog open onOpenChange={(open) => !open && router.back()}>
      <DialogContent
        // Kein Autofokus aufs Kommentarfeld (öffnet sonst auf Handys die Tastatur)
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="max-h-[88vh] overflow-y-auto p-6 sm:max-w-4xl"
      >
        <DialogTitle className="sr-only">Ticket-Details</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}
