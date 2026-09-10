import { describe, expect, it } from "vitest";
import { tokenise } from "@/domain/triage/normalise";
import {
  buildCorpus,
  centroid,
  cosine,
  vectorise,
} from "@/domain/triage/tfidf";

const docs = [
  "the lift crashed the game",
  "the elevator froze the whole game",
  "audio cuts out in the server room",
  "no sound in the server room at all",
  "textures flicker on the bridge",
].map(tokenise);

const corpus = buildCorpus(docs);

describe("tfidf", () => {
  it("scores a document against itself as 1", () => {
    const v = vectorise(docs[0], corpus);
    expect(cosine(v, v)).toBeCloseTo(1, 10);
  });

  it("scores unrelated documents near 0", () => {
    const lift = vectorise(docs[0], corpus);
    const bridge = vectorise(docs[4], corpus);
    expect(cosine(lift, bridge)).toBeLessThan(0.1);
  });

  it("ranks a related document above an unrelated one", () => {
    const audio = vectorise(docs[2], corpus);
    expect(cosine(audio, vectorise(docs[3], corpus))).toBeGreaterThan(
      cosine(audio, vectorise(docs[4], corpus)),
    );
  });

  it("weighs a rare token above a common one", () => {
    // "game" appears in two of five documents, "bridge" in one.
    const rare = vectorise(tokenise("bridge"), corpus);
    const common = vectorise(tokenise("game"), corpus);
    const both = vectorise(tokenise("bridge game"), corpus);
    expect(cosine(both, rare)).toBeGreaterThan(cosine(both, common));
  });

  it("returns an empty vector for a document with no tokens", () => {
    const empty = vectorise([], corpus);
    expect(empty.size).toBe(0);
    expect(cosine(empty, vectorise(docs[0], corpus))).toBe(0);
  });

  it("is comparable across corpora of different sizes", () => {
    // The point of holding no persisted vocabulary: a vector built against a
    // grown corpus is still comparable with one built earlier.
    const grown = buildCorpus([...docs, ...docs.map((d) => [...d, "extra"])]);
    const before = vectorise(docs[0], corpus);
    const after = vectorise(docs[0], grown);
    expect(cosine(before, after)).toBeGreaterThan(0.95);
  });
});

describe("centroid", () => {
  it("sits closer to its members than to a stranger", () => {
    const members = [docs[2], docs[3]].map((d) => vectorise(d, corpus));
    const c = centroid(members);
    expect(cosine(c, members[0])).toBeGreaterThan(0.5);
    expect(cosine(c, vectorise(docs[4], corpus))).toBeLessThan(0.2);
  });

  it("does not depend on the order its members arrived in", () => {
    const members = docs.slice(0, 3).map((d) => vectorise(d, corpus));
    const forward = centroid(members);
    const backward = centroid([...members].reverse());
    expect(cosine(forward, backward)).toBeCloseTo(1, 10);
  });

  it("is empty for an issue with no reports", () => {
    expect(centroid([]).size).toBe(0);
  });
});
