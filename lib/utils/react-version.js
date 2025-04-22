import fetch from "node-fetch";

let cachedVersion = null;

export async function getLatestReactVersion() {
  if (cachedVersion) return cachedVersion;

  try {
    const res = await fetch("https://registry.npmjs.org/react/latest");
    const data = await res.json();
    cachedVersion = data.version;
    return cachedVersion;
  } catch (err) {
    console.warn(
      "⚠️ Failed to fetch latest React version from npm:",
      err.message
    );
    return null;
  }
}
