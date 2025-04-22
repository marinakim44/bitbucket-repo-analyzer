import semver from "semver";

export function getReactSupportStatus(versionRange) {
  const version = semver.minVersion(versionRange);
  if (!version) return "❓ unknown";

  const major = version.major;

  if (major >= 18) return "✅ Active support";
  if (major === 17) return "⚠️ Deprecated (no new features)";
  if (major === 16) return "❌ Legacy (migrate)";
  if (major >= 0 && major < 16) return "❌ Unsupported (pre-modern React)";
  return "❓ unknown";
}
