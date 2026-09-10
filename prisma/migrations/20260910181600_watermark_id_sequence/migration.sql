-- A dedicated sequence for AccessGrant.watermarkId (SPEC.md §4, §6.2).
--
-- Until now the sequence was created on demand inside the grant transaction,
-- with a silent fallback to max(watermarkId) + 1 if the raw SQL failed. That
-- fallback is a race: two testers requesting access at the same moment both
-- read the same maximum, and one of them loses to the unique constraint --
-- or, worse, does not, and two people share a forensic identity.
--
-- NO CYCLE is deliberate. A cycling sequence would silently hand grant 65,536
-- the identity of grant 1, and forensics would then name the wrong person
-- with full confidence. Running out must be a loud failure, not a quiet
-- reassignment. The 16-bit ceiling is stated in the README.
CREATE SEQUENCE IF NOT EXISTS watermark_id_seq
  AS integer
  MINVALUE 1
  MAXVALUE 65535
  NO CYCLE;

-- Grants issued before this migration were numbered by the fallback path.
-- Start the sequence past them so it never reissues an id already in use.
SELECT setval(
  'watermark_id_seq',
  GREATEST(COALESCE((SELECT MAX("watermarkId") FROM "AccessGrant"), 0), 1),
  true
);
