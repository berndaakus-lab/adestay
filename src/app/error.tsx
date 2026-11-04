"use client";

import { StatePage } from "@/components/states";
import { Button } from "@/components/ui/button";

// Unexpected errors. Shows only a reference (digest) that matches the server log; never details.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <StatePage
      eyebrow="Something went wrong"
      title="We could not load this page"
      action={
        <Button type="button" onClick={reset}>
          Try again
        </Button>
      }
    >
      <p>Please try again. If it keeps happening, send this reference to support.</p>
      {error.digest ? <p className="mt-3 font-mono text-sm text-foreground">Reference: {error.digest}</p> : null}
    </StatePage>
  );
}
