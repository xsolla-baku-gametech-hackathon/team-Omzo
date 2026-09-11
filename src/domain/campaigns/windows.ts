/**
 * Application and testing windows for a campaign.
 *
 * Pure domain: every gate that decides whether a tester may apply or play
 * reads these functions so the form, the apply API, and the access/ingest
 * paths cannot disagree about the calendar.
 */

export interface CampaignWindows {
  readonly applicationOpensAt: Date;
  readonly applicationClosesAt: Date;
  readonly testingStartsAt: Date;
  readonly testingEndsAt: Date;
}

export class InvalidCampaignWindowsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCampaignWindowsError";
  }
}

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;

/** Default year-long windows for link/web campaigns that hide the fields. */
export function defaultCampaignWindows(now: Date = new Date()): CampaignWindows {
  const end = new Date(now.getTime() + MS_PER_YEAR);
  return {
    applicationOpensAt: now,
    applicationClosesAt: end,
    testingStartsAt: now,
    testingEndsAt: end,
  };
}

/**
 * Throws when the four timestamps contradict each other or the testing
 * window has already ended at create time.
 */
export function assertCampaignWindows(
  windows: CampaignWindows,
  options: { readonly now?: Date; readonly requireFutureTestingEnd?: boolean } = {},
): void {
  const now = options.now ?? new Date();
  const {
    applicationOpensAt: appOpen,
    applicationClosesAt: appClose,
    testingStartsAt: testStart,
    testingEndsAt: testEnd,
  } = windows;

  if (!(appOpen.getTime() < appClose.getTime())) {
    throw new InvalidCampaignWindowsError(
      "Application window must open before it closes.",
    );
  }
  if (!(testStart.getTime() < testEnd.getTime())) {
    throw new InvalidCampaignWindowsError(
      "Testing window must start before it ends.",
    );
  }
  if (appOpen.getTime() > testStart.getTime()) {
    throw new InvalidCampaignWindowsError(
      "Applications cannot open after testing starts.",
    );
  }
  if (appClose.getTime() > testEnd.getTime()) {
    throw new InvalidCampaignWindowsError(
      "Applications cannot close after testing ends.",
    );
  }
  if (
    options.requireFutureTestingEnd !== false &&
    testEnd.getTime() <= now.getTime()
  ) {
    throw new InvalidCampaignWindowsError(
      "Testing end must be in the future.",
    );
  }
}

export function isWithinApplicationWindow(
  windows: CampaignWindows,
  now: Date = new Date(),
): boolean {
  const t = now.getTime();
  return (
    t >= windows.applicationOpensAt.getTime() &&
    t <= windows.applicationClosesAt.getTime()
  );
}

export function isWithinTestingWindow(
  windows: CampaignWindows,
  now: Date = new Date(),
): boolean {
  const t = now.getTime();
  return (
    t >= windows.testingStartsAt.getTime() &&
    t <= windows.testingEndsAt.getTime()
  );
}

export function canApply(
  windows: CampaignWindows,
  now: Date = new Date(),
): boolean {
  return isWithinApplicationWindow(windows, now);
}

export function canPlay(
  windows: CampaignWindows,
  now: Date = new Date(),
): boolean {
  return isWithinTestingWindow(windows, now);
}
