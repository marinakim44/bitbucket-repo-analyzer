import simpleGit from "simple-git";
import fs from "fs";
import path from "path";
import os from "os";
import getFiles from "../utils/getFiles.js";

const tmpDir = path.join(os.tmpdir(), "bitbucket-repo-analyzer");
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

export async function checkAwsSdk(repo, options = {}) {
  const repoPath = path.join(tmpDir, repo.slug);

  // Clone if not already present
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
      return {
        slug: repo.slug,
        usesV2: false,
        usesV3: false,
        note: `clone failed: ${err.message}`,
      };
    }
  }

  // 1) Try quick paths
  const possiblePaths = [
    path.join(repoPath, "package.json"),
    path.join(repoPath, "lambda", "package.json"),
    path.join(repoPath, "backend", "package.json"),
    path.join(repoPath, "functions", "package.json"),
  ];
  let packageJsonPath = possiblePaths.find((p) => {
    const exists = fs.existsSync(p);
    console.log(`Checking ${p}: ${exists ? "FOUND" : "missing"}`);
    return exists;
  });

  // 2) Fallback to deep scan if quick paths missed it
  if (!packageJsonPath) {
    console.log("Quick scan missed it, doing deep scan…");
    const allFiles = getFiles(repoPath);
    packageJsonPath = allFiles.find((p) =>
      p.toLowerCase().endsWith("package.json")
    );
    console.log(
      packageJsonPath
        ? `Deep scan found: ${packageJsonPath}`
        : "Deep scan also missed it"
    );
  }

  // 3) If still missing, return note
  if (!packageJsonPath) {
    return {
      slug: repo.slug,
      usesV2: false,
      usesV3: false,
      note: "no package.json",
    };
  }

  // Read and parse package.json
  let pkg;
  try {
    const raw = fs.readFileSync(packageJsonPath, "utf8");
    pkg = JSON.parse(raw);
  } catch (err) {
    return {
      slug: repo.slug,
      usesV2: false,
      usesV3: false,
      note: `broken package.json: ${err.message}`,
    };
  }

  // Detect AWS SDK usage
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const usesV2 = "aws-sdk" in deps;
  const usesV3 = Object.keys(deps).some((d) => d.startsWith("@aws-sdk/"));

  return {
    slug: repo.slug,
    usesV2: Boolean(usesV2),
    usesV3: Boolean(usesV3),
  };
}