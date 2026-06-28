/** Map a derived project status to a DgaStatusTag `color`. Shared across the
 *  investor project list and the project workspace so the chips stay consistent. */
export function dgaStatusColor(status: string): "neutral" | "green" | "blue" | "yellow" | "red" {
  switch (status) {
    case "on-track": return "green";
    case "delayed": return "yellow";
    case "stalled": return "red";
    case "complete": return "blue";
    default: return "neutral";
  }
}
