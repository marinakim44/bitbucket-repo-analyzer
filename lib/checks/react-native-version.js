import "dotenv/config";
import simpleGit from "simple-git";
import fs from "fs";
import path from "path";
import os from "os";
import semver from "semver";
import fetchJson from "../utils/http.js";
import getFiles from "../utils/getFiles.js";

const tmpDir = path.join(os.tmpdir(), "bitbucket-repo-analyzer");
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

async function getSupportedRNVersions() {
  // npm's "latest" tag == current stable
  const meta = await fetchJson(
    "https://registry.npmjs.org/react-native/latest"
  );
  const latest = semver.parse(meta.version);
  if (!latest) throw new Error("Could not parse RN latest version");

  // Supported window: latest + previous two minor series as per RN policy
  const minors = [latest.minor, latest.minor - 1, latest.minor - 2].filter(
    (m) => m >= 0
  );

  // Normalize to ranges (e.g., 0.81.x)
  const series = minors.map((m) => `0.${m}.x`);

  return {
    latest: latest.version, // e.g., 0.81.0
    supportedSeries: series, // e.g., ["0.81.x","0.80.x","0.79.x"]
  };
}

function normalizeRange(v) {
  // Strip npm dist-tags, git urls, workspaces, file:, etc. Early exit.
  if (/^(git\+|file:|workspace:|link:|http)/.test(v)) return null;
  // Common range prefixes
  return v.replace(/^[\^~<>=\s]*/, "");
}

export async function checkReactNativeVersion(repo, options = {}) {
  const repoPath = path.join(tmpDir, repo.slug);

  if (!fs.existsSync(repoPath)) {
    const git = simpleGit(tmpDir);
    const httpsClone = repo.links.clone.find((l) => l.name === "https").href;
    const sanitizedUrl = httpsClone.replace(/https:\/\/.*@/, "https://");
    const encodedUsername = encodeURIComponent(
      process.env.BITBUCKET_USERNAME || ""
    );
    const encodedPassword = encodeURIComponent(
      process.env.BITBUCKET_APP_PASSWORD || ""
    );
    const cloneUrl = sanitizedUrl.replace(
      "https://",
      `https://${encodedUsername}:${encodedPassword}@`
    );
    try {
      await git.clone(cloneUrl, repo.slug, ["--depth", "1"]);
    } catch (err) {
      return `Failed to clone ${repo.slug}: ${err.message}`;
    }
  }

  const allFiles = getFiles(repoPath).filter((p) => p.endsWith("package.json"));
  let declared = null;

  for (const p of allFiles) {
    try {
      const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const rnVersion = deps?.["react-native"];
      if (rnVersion) {
        declared = rnVersion;
        break;
      }
    } catch {}
  }

  if (!declared) {
    return `${repo.slug} is not using React Native`;
  }

  const normalized = normalizeRange(declared);
  let current = null;
  try {
    if (normalized) current = semver.minVersion(normalized);
  } catch {}

  // Fetch supported window from npm
  let supportedInfo;
  try {
    supportedInfo = await getSupportedRNVersions();
  } catch (e) {
    // Fallback: assume active if >= 0.79 (tune as needed)
    supportedInfo = {
      latest: "unknown",
      supportedSeries: [">=0.80.x"],
    };
  }

  // Determine support status
  let status = "unknown";
  if (current) {
    if (current.major > 0) {
      status = "Unknown (unexpected major)";
    } else {
      const seriesKey = `0.${current.minor}.x`;
      if (supportedInfo.supportedSeries.includes(seriesKey)) {
        status =
          seriesKey === supportedInfo.supportedSeries[0]
            ? "Current (supported)"
            : "Supported";
      } else if (
        current.minor <
        Math.min(
          ...supportedInfo.supportedSeries.map((s) =>
            parseInt(s.split(".")[1], 10)
          )
        )
      ) {
        status = "Outdated";
      } else {
        status = "Unknown";
      }
    }
  } else {
    status = "Unparsable version (git/url/range?)";
  }

  return {
    repo: repo.slug,
    version: declared,
    status,
    supportedVersions: supportedInfo.supportedSeries,
    raw: `...checking ${repo.slug}: react-native: ${declared} (resolved: ${
      current?.version ?? "n/a"
    }) | latest: ${
      supportedInfo.latest
    } | supported: ${supportedInfo.supportedSeries.join(
      ", "
    )} | support: ${status}`,
  };
}
