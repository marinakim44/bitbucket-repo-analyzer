import simpleGit from "simple-git";
import fs from "fs";
import path from "path";
import os from "os";
import semver from "semver";

const tmpDir = path.join(os.tmpdir(), "bitbucket-repo-analyzer");
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

export async function checkReactNativeVersion(repo, options = {}) {
  const repoPath = path.join(tmpDir, repo.slug);

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

  const allFiles = getAllFiles(repoPath).filter((p) =>
    p.endsWith("package.json")
  );
  let foundVersion = null;

  for (const p of allFiles) {
    try {
      const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const rnVersion = deps["react-native"];

      if (rnVersion) {
        foundVersion = rnVersion;
        break;
      }
    } catch {
      // skip invalid package.json
    }
  }

  if (!foundVersion) {
    return `❌ ${repo.slug} is not using React Native`;
  }

  let current;
  let status = "❓ unknown";

  try {
    current = semver.minVersion(foundVersion);
  } catch (err) {
    current = null;
  }

  if (current) {
    if (current.major === 0 && current.minor < 70) {
      status = "❌ legacy (pre-0.70)";
    } else if (current.major === 0 && current.minor < 72) {
      status = "⚠️ deprecated (<0.72)";
    } else {
      status = "✅ active support";
    }
  }

  return {
    repo: repo.slug,
    version: foundVersion,
    status,
    raw: `🔎 ${repo.slug}: react-native: ${foundVersion} | support: ${status}`,
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
