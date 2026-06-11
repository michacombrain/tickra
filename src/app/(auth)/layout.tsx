export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Tickra</h1>
          <p className="text-sm text-muted-foreground">Projektmanagement für dein Team</p>
        </div>
        {children}
      </div>
    </div>
  );
}
