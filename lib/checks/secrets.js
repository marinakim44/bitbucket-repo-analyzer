import fs from "fs";
import path from "path";
import os from "os";
import simpleGit from "simple-git";

const tmpDir = path.join(os.tmpdir(), "bitbucket-repo-analyzer");
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

const riskyFileNames = [
  ".env",
  ".env.local",
  ".env.production",
  ".pem",
  "id_rsa",
];
const riskyPatterns = [
  /API[_-]?KEY\s*=/i,
  /SECRET\s*=/i,
  /Bearer\s+[a-z0-9\-_\.]+/i,
  /-----BEGIN (RSA|PRIVATE|API) KEY-----/,
];

function getAllFiles(dir, exclude = ["node_modules", ".git"], files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!exclude.includes(entry.name)) {
        getAllFiles(fullPath, exclude, files);
      }
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

export async function checkSecrets(repo, options = {}) {
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

  const files = getAllFiles(repoPath);
  const secretHits = [];

  for (const file of files) {
    const fileName = path.basename(file);

    // Check risky filenames
    if (riskyFileNames.includes(fileName)) {
      secretHits.push(`🧨 Sensitive file: ${fileName}`);
      continue;
    }

    // Check contents
    try {
      const content = fs.readFileSync(file, "utf8");
      for (const pattern of riskyPatterns) {
        if (pattern.test(content)) {
          secretHits.push(`⚠️  ${fileName} matches ${pattern}`);
          break;
        }
      }
    } catch {
      // skip unreadable/binary files
    }
  }

  if (secretHits.length === 0) {
    return `🔎 ${repo.slug}: ✅ No secrets found`;
  }

  return {
    repo: repo.slug,
    raw: `🔎 ${repo.slug}: 🚨 Potential secrets found:\n  • ${secretHits.join(
      "\n  • "
    )}`,
    hits: secretHits,
  };
}
