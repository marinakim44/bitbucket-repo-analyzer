import semver from "semver";
import { getLatestReactVersion } from "./react-version.js";

export async function getReactSupportStatus(range) {
  const min = semver.minVersion(range.replace(/^[\^~<>= ]*/, ""));
  if (!min) return "Unknown";

  const latest = await getLatestReactVersion();
  if (!latest) return "Unknown";

  if (min.major < latest.major) {
    return "Outdated";
  }

  const minors = [latest.minor, latest.minor - 1, latest.minor - 2].filter(
    (m) => m >= 0
  );
  const series = minors.map((m) => `${latest.major}.${m}.x`);
  const key = `${min.major}.${min.minor}.x`;

  if (key === series[0]) return "Current";
  if (series.slice(1).includes(key)) return "Supported";

  return "Outdated";
}
