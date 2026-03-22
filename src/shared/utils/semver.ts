/**
 * @fileoverview Lightweight semver comparison utility.
 *
 * Handles standard semver strings with optional prerelease tags
 * (e.g. "2.1.0", "2.1.1-beta.3", "2.0.0-rc.1"). No third-party dependencies.
 *
 * Comparison rules (per semver 2.0.0 spec):
 * 1. Compare major.minor.patch numerically
 * 2. A version with a prerelease tag has lower precedence than the same
 *    version without one (e.g. 2.1.1-beta.3 < 2.1.1)
 * 3. Prerelease identifiers are compared segment-by-segment: numeric segments
 *    are compared as integers, string segments are compared lexicographically
 */

interface ParsedSemver {
  major: number
  minor: number
  patch: number
  prerelease: string[]
}

/** Parses a semver string (with or without leading "v") into its components. */
function parse(version: string): ParsedSemver {
  const cleaned = version.replace(/^v/, '')
  const [core, pre] = cleaned.split('-', 2)
  const [major = 0, minor = 0, patch = 0] = core.split('.').map(Number)
  const prerelease = pre ? pre.split('.') : []
  return { major, minor, patch, prerelease }
}

/**
 * Compares two semver version strings.
 * @returns -1 if a < b, 0 if a == b, 1 if a > b
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = parse(a)
  const pb = parse(b)

  // Compare major.minor.patch
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (pa[key] < pb[key]) return -1
    if (pa[key] > pb[key]) return 1
  }

  // Both have no prerelease → equal
  if (pa.prerelease.length === 0 && pb.prerelease.length === 0) return 0

  // Prerelease has lower precedence than release
  if (pa.prerelease.length === 0) return 1 // a is release, b has prerelease → a > b
  if (pb.prerelease.length === 0) return -1 // b is release, a has prerelease → a < b

  // Compare prerelease segments
  const len = Math.max(pa.prerelease.length, pb.prerelease.length)
  for (let i = 0; i < len; i++) {
    if (i >= pa.prerelease.length) return -1 // a has fewer segments → a < b
    if (i >= pb.prerelease.length) return 1 // b has fewer segments → a > b

    const sa = pa.prerelease[i]
    const sb = pb.prerelease[i]
    const na = Number(sa)
    const nb = Number(sb)
    const aIsNum = !isNaN(na)
    const bIsNum = !isNaN(nb)

    if (aIsNum && bIsNum) {
      if (na < nb) return -1
      if (na > nb) return 1
    } else if (aIsNum) {
      return -1 // numeric < string
    } else if (bIsNum) {
      return 1 // string > numeric
    } else {
      if (sa < sb) return -1
      if (sa > sb) return 1
    }
  }

  return 0
}

/** Returns true if `remote` is a newer version than `current` (upgrade). */
export function isUpgrade(current: string, remote: string): boolean {
  return compareSemver(current, remote) === -1
}

/** Returns true if `remote` is an older version than `current` (downgrade). */
export function isDowngrade(current: string, remote: string): boolean {
  return compareSemver(current, remote) === 1
}
