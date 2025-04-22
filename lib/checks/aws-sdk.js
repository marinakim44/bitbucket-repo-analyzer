import simpleGit from "simple-git";
import fs from "fs";
import path from "path";
import os from "os";

const tmpDir = path.join(os.tmpdir(), "bitbucket-repo-analyzer");
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

export async function checkAwsSdk(repo, options = {}) {
  const repoPath = path.join(tmpDir, repo.slug);

  // Skip if already cloned
  if (!fs.existsSync(repoPath)) {
    const git = simpleGit(tmpDir);
    const httpsClone = repo.links.clone.find(
      (link) => link.name === "https"
    ).href;

    // Strip the existing username if present (e.g. mkim1@bitbucket.org)
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

  if (options.deepScan) {
    const allFiles = getAllFiles(repoPath);
    packageJsonPath = allFiles.find((p) => p.endsWith("package.json"));
  } else {
    const possiblePaths = [
      path.join(repoPath, "package.json"),
      path.join(repoPath, "lambda", "package.json"),
      path.join(repoPath, "backend", "package.json"),
      path.join(repoPath, "functions", "package.json"),
    ];
    packageJsonPath = possiblePaths.find((p) => fs.existsSync(p));
  }

  if (!packageJsonPath) {
    return `⚠️  ${repo.slug} has no package.json`;
  }

  let pkg;
  try {
    const raw = fs.readFileSync(packageJsonPath, "utf8");
    pkg = JSON.parse(raw);
  } catch (err) {
    return `❌ ${repo.slug} has a broken package.json: ${err.message}`;
  }

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  const usesV2 = "aws-sdk" in deps;
  const usesV3 = Object.keys(deps).some((d) => d.startsWith("@aws-sdk/"));

  let badges = [];

  if (usesV2) badges.push("🟡 AWS SDK v2");
  if (usesV3) badges.push("🟢 AWS SDK v3");
  if (!usesV2 && !usesV3) badges.push("❌ Not using AWS SDK");

  // return `🔎 ${repo.slug}: ${badges.join(" | ")}`;
  return {
    repo: repo.slug,
    usesV2: !!usesV2,
    usesV3: !!usesV3,
    raw: `🔎 ${repo.slug}: ${usesV2 ? "🟡 AWS SDK v2" : ""}${
      usesV3 ? " | 🟢 AWS SDK v3" : ""
    }${!usesV2 && !usesV3 ? "❌ Not using AWS SDK" : ""}`,
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
