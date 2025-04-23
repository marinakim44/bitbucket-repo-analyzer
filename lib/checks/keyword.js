import fs from "fs";
import path from "path";
import os from "os";
import simpleGit from "simple-git";

const tmpDir = path.join(os.tmpdir(), "bitbucket-repo-analyzer");
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

const defaultExcludes = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  ".turbo",
];

function getAllFiles(dir, excludeDirs = [], files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!excludeDirs.includes(entry.name)) {
        getAllFiles(fullPath, excludeDirs, files);
      }
    } else {
      // Only scan common text/code files
      if (
        /\.(js|ts|jsx|tsx|json|md|txt|env|yml|yaml|html|css|scss)$/i.test(
          entry.name
        )
      ) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

export async function checkKeyword(repo, options = {}) {
  const keyword = options.keyword?.toLowerCase();
  if (!keyword) {
    return `❌ No keyword provided for check`;
  }

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

  const files = getAllFiles(repoPath, defaultExcludes);

  const hits = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, "utf8").toLowerCase();
      if (content.includes(keyword)) {
        hits.push(path.relative(repoPath, file));
      }
    } catch {
      // ignore binary or unreadable files
    }
  }

  if (hits.length === 0) {
    return `🔎 ${repo.slug}: ❌ No matches for "${keyword}"`;
  }

  return {
    repo: repo.slug,
    matches: hits,
    raw: `🔎 ${repo.slug}: ✅ Found ${hits.length} match(es) for "${keyword}"`,
  };
}
