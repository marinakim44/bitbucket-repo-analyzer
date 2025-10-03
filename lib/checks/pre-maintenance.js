import simpleGit from "simple-git";
import fs from "fs";
import path from "path";
import os from "os";
import { checkReactVersion } from "./react-version.js";
import { checkReactNativeVersion } from "./react-native-version.js";
import { checkAwsSdk } from "./aws-sdk.js";
import {
  writeNpmrcOverrides,
  stripPrivateDeps,
  runNpmOutdated,
  runNpmAudit,
} from "../utils/npm.js";
import {
  checkNodeVersion,
  checkNodeVersionFromPipeline,
  installWithFallbacks,
} from "../utils/node.js";
import { IGNORED_SCOPES } from "../constants.js";

const tmpDir = path.join(os.tmpdir(), "bitbucket-repo-analyzer");
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

export async function runPreMaintenanceCheck(repo, options) {
  console.log(
    `Running pre-maintenance check on ${repo.slug} for branch: ${options?.branch}`
  );

  const repoPath = path.join(tmpDir, repo.slug);
  console.log("repoPath", repoPath);

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
      if (options.branch) {
        cloneArgs.push("--branch", options.branch, "--single-branch");
      }
      console.log("Cloning", cloneUrl);
      await git.clone(cloneUrl, repo.slug, cloneArgs);
    } catch (err) {
      return {
        repo: repo.slug,
        raw: `Failed to clone ${repo.slug}: ${err.message}`,
      };
    }
  } else {
    console.log(
      `Repo exists; fetching, cleaning, and force‐checking out ${options.branch}`
    );
    const repoGit = simpleGit(repoPath);
    await repoGit.fetch();
    await repoGit.reset(["--hard"]);
    await repoGit.clean("f", ["d"]);
    await repoGit.checkout(["-B", options.branch, `origin/${options.branch}`]);
    const current = await repoGit.revparse(["--abbrev-ref", "HEAD"]);
    console.log(`Now on branch: ${current}`);
  }

  console.log("looking for package.json");
  // looking for package.json
  let packageJsonPath = path.join(repoPath, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    const altPath = path.join(repoPath, "api", "package.json");
    if (fs.existsSync(altPath)) {
      packageJsonPath = altPath;
    } else {
      return {
        repo: repo.slug,
        raw: `No package.json found in ${repo.slug}`,
      };
    }
  }

  const projectDir = path.dirname(packageJsonPath);
  console.log("Running checks in: ", projectDir);

  writeNpmrcOverrides(projectDir, IGNORED_SCOPES);
  const { removed: removedPrivate } = stripPrivateDeps(
    projectDir,
    IGNORED_SCOPES
  );
  if (removedPrivate.length) {
    console.log(`Stripped private deps: ${removedPrivate.join(", ")}`);
  }

  let succeededNode;
  try {
    succeededNode = installWithFallbacks(projectDir, [
      "22",
      "20",
      "18",
      "16",
      "14",
      "12",
      "10",
      "8",
      "6",
      "4",
    ]);
    console.log(`npm install succeeded under Node ${succeededNode}`);
  } catch (installErr) {
    console.error(
      `npm install failed under all tested Node versions:`,
      installErr.message
    );
    return {
      repo: repo.slug,
      raw: `npm install failed entirely: ${installErr.message}`,
    };
  }

  let outdated = {};
  try {
    outdated = await runNpmOutdated(projectDir);
  } catch (err) {
    console.log("Error running npm outdated", err);
  }

  let audit = {};
  try {
    audit = await runNpmAudit(projectDir);
  } catch (err) {
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
        ? info.via.filter(Boolean).map((item) => {
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
        fixAvailable: info.fixAvailable,
      };
    }
  );

  // running additional checks
  console.log("checking React version...");
  const reactInfo = await checkReactVersion(repo, { deepScan: true });
  console.log("checking React Native version...");
  const reactNativeInfo = await checkReactNativeVersion(repo, {
    deepScan: true,
  });
  console.log("checking AWS SDK version...");
  const awsSdkInfo = await checkAwsSdk(repo, { deepScan: true });
  console.log("checking Node version...");
  const nodeInfo = checkNodeVersion(projectDir);
  const nodeFromPipeline = checkNodeVersionFromPipeline(projectDir);

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
    vulnerabilities: formattedVuln,
    react: reactInfo,
    reactNative: reactNativeInfo,
    awsSdk: awsSdkInfo,
    node: nodeInfo,
    nodeFromPipeline: nodeFromPipeline,
    succeededNodeVersion: succeededNode,
  };
}
