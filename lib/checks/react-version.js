import fs from "fs";
import path from "path";
import os from "os";
import semver from "semver";
import { getLatestReactVersion } from "../utils/react-version.js";
import { getReactSupportStatus } from "../utils/react-eos.js";
import getFiles from "../utils/getFiles.js";
import { cloneRepo } from "../utils/clone.js";

const tmpDir = path.join(os.tmpdir(), "bitbucket-repo-analyzer");
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

export async function checkReactVersion(repo, options = {}) {
  const latest = await getLatestReactVersion();
  const repoPath = path.join(tmpDir, repo.slug);

  // Skip if already cloned
  if (!fs.existsSync(repoPath)) {
    try {
      await cloneRepo(repo, repoPath);
    } catch (err) {
      return `Error cloning repo: ${err.message}`;
    }
  }

  let reactVersion = null;
  let reactDom = null;
  let reactNative = null;

  const files = options.deepScan
    ? getFiles(repoPath).filter((p) => p.endsWith("package.json"))
    : [path.join(repoPath, "package.json")];

  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    try {
      const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.react) {
        reactVersion = deps.react;
        reactDom = deps["react-dom"];
        reactNative = deps["react-native"];
        break;
      }
    } catch (err) {
      console.log(err);
    }
  }

  if (!reactVersion && !reactDom && !reactNative) {
    return `${repo.slug} is not using React`;
  }

  let supportStatus = null;
  let isOutdated = false;
  let current = null;

  if (reactVersion && semver.validRange(reactVersion)) {
    current = semver.minVersion(reactVersion);
    isOutdated = current && semver.lt(current, latest);
    supportStatus = await getReactSupportStatus(reactVersion);
  }

  const labels = [];

  if (reactVersion) {
    labels.push(`react: ${reactVersion}`);
    if (isOutdated) labels.push(`OUTDATED (latest is ${latest})`);
    if (supportStatus) labels.push(`support: ${supportStatus}`);
  }

  if (reactDom) labels.push(`react-dom: ${reactDom}`);
  if (reactNative) labels.push(`react-native: ${reactNative}`);

  return {
    repo: repo.slug,
    version: reactVersion || null,
    support: supportStatus || "not using React",
    raw: `...checking ${repo.slug}: ${labels.join(" | ")}`,
  };
}
