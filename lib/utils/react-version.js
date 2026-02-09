import semver from "semver";
import fetchJson from "./http.js";

let cached = null;

export async function getLatestReactVersion() {
  if (cached) return cached;

  try {
    const { version } = await fetchJson("https://registry.npmjs.org/react/latest");
    cached = semver.parse(version);
    return cached;
  } catch (err) {
    console.warn("Couldn’t fetch React@latest:", err.message);
    return null;
  }
}
