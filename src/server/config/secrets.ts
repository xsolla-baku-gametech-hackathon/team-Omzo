/**
 * Central secret loading, fail-closed.
 *
 * Every secret in this app used to be read as
 * `process.env.NAME ?? "some-hardcoded-fallback"`, which fails open twice
 * over:
 *
 *   1. The fallback strings are committed, so they are public. A deploy that
 *      forgets an env var silently signs with a key anyone can read out of
 *      the repository.
 *   2. `??` only substitutes null and undefined. `.env.example` ships
 *      `SESSION_SECRET=""`, so anyone copying the template verbatim gets an
 *      empty key rather than the fallback.
 *
 * The rule here is the opposite: outside development a missing, blank or
 * weak secret is a hard failure. An app that will not start is a far better
 * outcome than one serving forgeable sessions.
 */

/** HS256 and HMAC-SHA256 want at least a 256-bit key. */
export const MIN_SECRET_LENGTH = 32;

export type SecretName = "SESSION_SECRET" | "ACCESS_SECRET" | "APP_SALT";

export class InsecureSecretError extends Error {
  constructor(name: SecretName, reason: string) {
    super(
      `${name} ${reason}. Generate one with \`openssl rand -base64 32\` and ` +
        `set it in the environment. Refusing to start with a guessable key.`,
    );
    this.name = "InsecureSecretError";
  }
}

/**
 * Anything that is not explicitly development or test is treated as
 * production. A deploy that forgets to set NODE_ENV should fail closed, not
 * quietly pick up a development key.
 */
export function isRelaxedEnvironment(nodeEnv: string | undefined): boolean {
  return nodeEnv === "development" || nodeEnv === "test";
}

/** Reads the ambient environment. Split from the predicate so the predicate
 *  stays pure and "NODE_ENV is unset" is actually expressible. */
function relaxedHere(): boolean {
  return isRelaxedEnvironment(process.env.NODE_ENV);
}

/**
 * Deterministic per-name development keys. Deterministic so that a session
 * or an access grant survives a dev-server restart; distinct per name so a
 * bug that reads the wrong secret does not silently still verify.
 */
function developmentFallback(name: SecretName): string {
  return `insecure-development-only-${name.toLowerCase().replace(/_/g, "-")}-do-not-deploy`;
}

const warned = new Set<string>();

function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[secrets] ${message}`);
}

/**
 * Reads a secret, or throws outside development.
 *
 * Deliberately not cached: the cost is a property read, and caching would
 * make the environment impossible to vary between tests.
 */
export function requireSecret(name: SecretName): string {
  const raw = process.env[name];
  const value = typeof raw === "string" ? raw.trim() : "";

  if (value === "") {
    if (!relaxedHere()) {
      throw new InsecureSecretError(name, "is not set");
    }
    warnOnce(
      `missing:${name}`,
      `${name} is not set. Using a development-only key. This would refuse to start outside development.`,
    );
    return developmentFallback(name);
  }

  if (value.length < MIN_SECRET_LENGTH) {
    if (!relaxedHere()) {
      throw new InsecureSecretError(
        name,
        `is only ${value.length} characters, below the ${MIN_SECRET_LENGTH} required`,
      );
    }
    warnOnce(
      `weak:${name}`,
      `${name} is shorter than ${MIN_SECRET_LENGTH} characters. This would refuse to start outside development.`,
    );
  }

  return value;
}

/** The same value as a key for jose / node:crypto. */
export function requireSecretBytes(name: SecretName): Uint8Array {
  return new TextEncoder().encode(requireSecret(name));
}

/** Clears the one-shot warning state. Test seam only. */
export function resetSecretWarningsForTests(): void {
  warned.clear();
}
