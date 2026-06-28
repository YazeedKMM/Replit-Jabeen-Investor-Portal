import * as React from "react";
import { DgaCardV2 } from "platformscode-new-react";
import { cn } from "@/lib/utils";

type DgaCardV2Props = React.ComponentProps<typeof DgaCardV2>;

/**
 * Flexible content container backed by DgaCardV2.
 *
 * CRITICAL: DgaCardV2's shadow DOM exposes only NAMED slots ("card-content",
 * "card-actions") and NO default slot. A bare child is never assigned, so the
 * card collapses to an empty ~34px box (verified in-browser: 0 assigned nodes,
 * child height 0). Content MUST carry slot="card-content" — this wrapper sets it.
 *
 * The component already supplies its own surface: 16px padding, 16px radius, the
 * card background, and (effect="stroke") a 0.8px neutral border. Do NOT re-add
 * those. The host is display:block and fills its container width, so the inner
 * div only needs w-full to stretch (the card lays children out flex-start).
 */
export function DgaContentCard({
  className,
  children,
  effect = "stroke",
  ...rest
}: { className?: string; children: React.ReactNode } & DgaCardV2Props) {
  return (
    <DgaCardV2 effect={effect} {...rest}>
      <div slot="card-content" className={cn("w-full", className)}>
        {children}
      </div>
    </DgaCardV2>
  );
}
