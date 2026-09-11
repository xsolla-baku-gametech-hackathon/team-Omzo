import type { ReactNode } from "react";

import { EmptyPanel } from "@/components/EmptyPanel";

/**
 * EmptyState — product empty instruction with a professional animated panel.
 */
interface EmptyStateProps {
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
  readonly className?: string;
  readonly visual?: "radar" | "stream" | "shelf" | "campaigns" | "inbox";
}

export function EmptyState({
  title,
  description,
  action,
  className = "",
  visual = "radar",
}: EmptyStateProps) {
  return (
    <EmptyPanel
      title={title}
      description={description}
      action={action}
      visual={visual}
      align="start"
      className={className}
    />
  );
}
