import { DotsLoader } from "@/components/dots-loader";

export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <DotsLoader size="lg" className="text-primary" />
    </main>
  );
}
