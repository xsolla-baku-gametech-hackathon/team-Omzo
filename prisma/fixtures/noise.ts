/**
 * Reports that must never become an issue (SPEC.md §5.4).
 *
 * Three kinds, deliberately: too short to mean anything, long enough but
 * about nothing, and questions aimed at the studio rather than the build.
 * The third kind is the interesting one -- it is well-formed English of a
 * reasonable length, and only the absence of any domain-relevant token
 * separates it from a real report.
 */
export const NOISE_BODIES: readonly string[] = [
  // too short to carry meaning
  "idk",
  "lol",
  "test",
  "...",
  "hi",
  "?",
  "asdf",
  "n/a",
  "oops",
  "nvm",

  // long enough, about nothing
  "hello everyone how is it going today, hope you are all well",
  "just wanted to say thanks for letting me into the playtest",
  "not sure if this is the right place to put this honestly",
  "my friend told me about this and I signed up yesterday",
  "really enjoying myself so far, keep up the good work team",
  "no comment at the moment, will come back to this later on",
  "posting this to check that the form actually submits properly",
  "ignore me, I pressed the wrong key by accident there",

  // questions for the studio, not reports about the build
  "when is the next build going out to testers",
  "how do I get the key for the second area of the map",
  "is there a discord for this playtest anywhere",
  "will there be a mac version at some point",
  "am I allowed to stream this or is that against the nda",
  "who do I talk to about getting paid for these reports",
  "is anyone else testing this right now or just me",
];
