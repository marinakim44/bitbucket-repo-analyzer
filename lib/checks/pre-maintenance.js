import simpleGit from "simple-git";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";

const tmpDir = path.join(os.tmpdir(), "bitbucket-repo-analyzer");
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

export async function runPreMaintenanceCheck(repo, options) {
  console.log(`Running pre-maintenance check on ${repo.slug} for branch: ${options?.branch}`);

  const repoPath = path.join(tmpDir, repo.slug);

  if (!fs.existsSync(repoPath)) {
    const git = simpleGit(tmpDir);
    const httpsClone = repo.links.clone.find(
      (link) => link.name === "https"
    ).href;
    const gitUrl = new URL(httpsClone);

    gitUrl.username = process.env.BITBUCKET_USERNAME || "";
    gitUrl.password = process.env.BITBUCKET_APP_PASSWORD || "";
    const cloneUrl = gitUrl.toString();

    try {
      const cloneArgs = ["--depth", "1"];
      if(options.branch) {
        cloneArgs.push("--branch", options.branch, "--single-branch");
      }
      console.log("Cloning", cloneUrl)
      await git.clone(cloneUrl, repo.slug, cloneArgs);
    } catch (err) {
      return {
        repo: repo.slug,
        raw: `Failed to clone ${repo.slug}: ${err.message}`,
      };
    }
  }

  console.log("looking for package.json")
  // looking for package.json
  const packageJsonPath = path.join(repoPath, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return {
      repo: repo.slug,
      raw: `No package.json found in ${repo.slug}`,
    };
  }

  let outdated = {};
  try {
    console.log("running npm install...")
    execSync("npm install --no-audit --no-fund", {
      cwd: repoPath,
      stdio: "ignore",
    });
    console.log("running npm outdated...")
    const out = execSync("npm outdated --json", {
      cwd: repoPath,
      stdio: ["pipe", "pipe", "ignore"],
    }).toString();
    outdated = JSON.parse(out);
  } catch (err) {
    if (err.status === 1 && err.stdout) {
      outdated = JSON.parse(err.stdout.toString());
    } else {
      console.error(`npm outdated failed:`, err.message);
      outdated = {};
    }
  }

  let audit = {};
  try {
    console.log("running npm audit...");
    const auditOut = execSync("npm audit --json --omit=dev", {
      cwd: repoPath,
      stdio: ["ignore", "pipe", "pipe"]
    }).toString();
    audit = JSON.parse(auditOut);
  } catch(err) {
    if (err.status === 1 && err.stdout) {
      audit = JSON.parse(err.stdout.toString());
    } else {
      console.error(`npm audit failed:`, err.message);
      audit = {};
    }
  }

  const formattedPackages = Object.entries(outdated).map(([name, data]) => ({
    name,
    current: data.current,
    wanted: data.wanted,
    latest: data.latest,
  }));

  const formattedVuln = Object.entries(audit.vulnerabilities || {}).map(
    ([packageName, info]) => {
      const via = Array.isArray(info.via)
        ? info.via
            .filter(Boolean)
            .map((item) => {
              if (typeof item === "string" || typeof item === "number") {
                return String(item);
              }
              if (item && typeof item === "object") {
                return item.name ?? item.source ?? JSON.stringify(item);
              }
              return String(item);
            })
        : [];
      const nodes = Array.isArray(info.nodes)
        ? info.nodes.map((n) =>
            typeof n === "string"
              ? { path: n }
              : { version: n.version, paths: n.paths }
          )
        : [];
      return {
        name: packageName,
        severity: info.severity,
        isDirect: info.isDirect,
        range: info.range,
        via,
        nodes,
        fixAvailable: info.fixAvailable
      }
    }
  )

  return {
    repo: repo.slug,
    oudatedCount: formattedPackages.length,
    oudatedPackages: formattedPackages,
    totalNumberOfVulnerabilities: audit?.metadata?.vulnerabilities?.total,
    info: audit?.metadata?.vulnerabilities?.info,
    low: audit?.metadata?.vulnerabilities?.low,
    moderate: audit?.metadata?.vulnerabilities?.moderate,
    high: audit?.metadata?.vulnerabilities?.high,
    critical: audit?.metadata?.vulnerabilities?.critical,
    vulnerabilities: formattedVuln
  };
}