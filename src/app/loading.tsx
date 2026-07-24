export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div
        role="status"
        aria-label="Loading"
        className="border-muted-foreground/30 border-t-foreground size-8 animate-spin rounded-full border-2"
      />
    </main>
  );
}
