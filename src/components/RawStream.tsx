"use client";

/**
 * The right-hand column: reports exactly as they arrived.
 *
 * Deliberately quieter than the board beside it -- smaller type, one colour,
 * no severity, no emphasis (SPEC.md §8). The contrast between the two columns
 * is the product's whole argument: this is what a studio reads today, and the
 * column on the left is what Repro turns it into. Styling this one to compete
 * would undo the point.
 */

export interface StreamReport {
  readonly id: string;
  readonly body: string;
  readonly scene: string;
  readonly isNoise: boolean;
  readonly issueTitle: string | null;
  readonly createdAt: number;
}

function timeAgo(createdAt: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - createdAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

export function RawStream({
  reports,
  now,
}: {
  readonly reports: readonly StreamReport[];
  readonly now: number;
}) {
  if (reports.length === 0) {
    return (
      <p className="px-4 py-6 text-label text-slate">
        Nothing yet. Reports appear here the moment a tester presses F1.
      </p>
    );
  }

  return (
    <ol className="divide-y divide-hairline">
      {reports.map((report) => (
        <li key={report.id} className="px-4 py-3">
          <p className="text-label text-slate">
            <span className="tabular-nums">
              {timeAgo(report.createdAt, now)}
            </span>
            <span aria-hidden="true"> · </span>
            <span>{report.scene}</span>
            {report.isNoise && (
              <>
                <span aria-hidden="true"> · </span>
                <span title="Filed, but not counted towards any issue">
                  set aside
                </span>
              </>
            )}
          </p>
          <p
            className={`mt-0.5 text-label ${report.isNoise ? "text-slate" : "text-ink"}`}
          >
            {report.body}
          </p>
        </li>
      ))}
    </ol>
  );
}
