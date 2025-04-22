import simpleGit from "simple-git";
import fs from "fs";
import path from "path";
import os from "os";
import semver from "semver";
import { getLatestReactVersion } from "../utils/react-version.js";
import { getReactSupportStatus } from "../utils/react-eos.js";

const tmpDir = path.join(os.tmpdir(), "bitbucket-repo-analyzer");
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

export async function checkReactVersion(repo, options = {}) {
  const repoPath = path.join(tmpDir, repo.slug);

  // Skip if already cloned
  if (!fs.existsSync(repoPath)) {
    const git = simpleGit(tmpDir);
    const httpsClone = repo.links.clone.find(
      (link) => link.name === "https"
    ).href;

    const sanitizedUrl = httpsClone.replace(/https:\/\/.*@/, "https://");
    const encodedUsername = encodeURIComponent(process.env.BITBUCKET_USERNAME);
    const encodedPassword = encodeURIComponent(
      process.env.BITBUCKET_APP_PASSWORD
    );
    const cloneUrl = sanitizedUrl.replace(
      "https://",
      `https://${encodedUsername}:${encodedPassword}@`
    );

    try {
      await git.clone(cloneUrl, repo.slug, ["--depth", "1"]);
    } catch (err) {
      return `❌ Failed to clone ${repo.slug}: ${err.message}`;
    }
  }

  let packageJsonPath;

  let reactVersion = null;
  let reactDom = null;
  let reactNative = null;
  let supportStatus = null;
  let isOutdated = false;

  if (options.deepScan) {
    const allFiles = getAllFiles(repoPath).filter((p) =>
      p.endsWith("package.json")
    );

    for (const p of allFiles) {
      try {
        const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        if (deps["react"]) {
          reactVersion = deps["react"];
          reactDom = deps["react-dom"];
          reactNative = deps["react-native"];

          const latest = await getLatestReactVersion();
          if (
            latest &&
            semver.validRange(reactVersion) &&
            semver.minVersion(reactVersion)
          ) {
            const current = semver.minVersion(reactVersion);
            isOutdated = semver.lt(current, latest);
            supportStatus = getReactSupportStatus(reactVersion);
          }

          break; // ✅ stop after first React hit
        }
      } catch (err) {
        // ignore invalid JSON files
      }
    }
  } else {
    const packageJsonPath = path.join(repoPath, "package.json");

    if (!fs.existsSync(packageJsonPath)) {
      return `⚠️  ${repo.slug} has no package.json`;
    }

    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      reactVersion = deps["react"];
      reactDom = deps["react-dom"];
      reactNative = deps["react-native"];

      if (reactVersion) {
        const latest = await getLatestReactVersion();
        if (
          latest &&
          semver.validRange(reactVersion) &&
          semver.minVersion(reactVersion)
        ) {
          const current = semver.minVersion(reactVersion);
          isOutdated = semver.lt(current, latest);
          supportStatus = getReactSupportStatus(reactVersion);
        }
      }
    } catch (err) {
      return `❌ ${repo.slug} has a broken package.json: ${err.message}`;
    }
  }

  if (!reactVersion && !reactDom && !reactNative) {
    return `❌ ${repo.slug} is not using React`;
  }

  const labels = [];

  if (reactVersion) {
    labels.push(`react: ${reactVersion}`);
    const latest = await getLatestReactVersion();
    if (
      latest &&
      semver.validRange(reactVersion) &&
      semver.minVersion(reactVersion)
    ) {
      const current = semver.minVersion(reactVersion);
      isOutdated = semver.lt(current, latest);
      supportStatus = getReactSupportStatus(reactVersion);

      if (isOutdated) {
        labels.push(`❌ outdated (latest is ${latest})`);
      }

      labels.push(`support: ${supportStatus}`);
    }
  }

  if (reactDom) labels.push(`react-dom: ${reactDom}`);
  if (reactNative) labels.push(`react-native: ${reactNative}`);

  return {
    repo: repo.slug,
    reactVersion: reactVersion || null,
    outdated: isOutdated || false,
    support: supportStatus || "not using React",
    raw: `🔎 ${repo.slug}: ${labels.join(" | ")}`,
  };
}

function getAllFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      getAllFiles(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }

  return files;
}
