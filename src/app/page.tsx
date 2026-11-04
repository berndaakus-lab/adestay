import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

// Platform landing page on the app host. Hostel websites live on their own domains.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-4 py-24 md:px-10">
      <Logo />
      <div className="flex flex-col gap-5">
        <p className="eyebrow">Coming soon</p>
        <h1 className="text-5xl md:text-7xl">A better way to run your hostel.</h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Branded booking websites, bed allocation, Mobile Money payments and a student portal, built for hostels in
          Ghana.
        </p>
      </div>
      <div>
        <Button asChild size="lg">
          <Link href="/sign-in">Staff sign in</Link>
        </Button>
      </div>
    </main>
  );
}
