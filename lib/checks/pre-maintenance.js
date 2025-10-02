import simpleGit from "simple-git";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { checkReactVersion } from "./react-version.js";
import { checkReactNativeVersion } from "./react-native-version.js";
import { checkAwsSdk } from "./aws-sdk.js";

const IGNORED_SCOPES = ["@vidatecdevs"];

function writeNpmrcOverrides(repoPath, scopes = IGNORED_SCOPES) {
  // Force these scopes to resolve against the public npm registry (no auth)
  const lines = scopes.map((s) => `${s}:registry=https://registry.npmjs.org/`);
  const npmrcPath = path.join(repoPath, ".npmrc");
  try {
    const existing = fs.existsSync(npmrcPath)
      ? fs.readFileSync(npmrcPath, "utf8")
      : "";
    const merged =
      [existing.trim(), ...lines].filter(Boolean).join("\n") + "\n";
    fs.writeFileSync(npmrcPath, merged);
  } catch (e) {
    console.warn("Failed writing .npmrc overrides:", e.message);
  }
}

function stripPrivateDeps(repoPath, scopes = IGNORED_SCOPES) {
  const pkgPath = path.join(repoPath, "package.json");
  if (!fs.existsSync(pkgPath)) return { removed: [] };

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const sections = [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ];
  const removed = [];

  for (const sec of sections) {
    if (!pkg[sec]) continue;
    for (const name of Object.keys(pkg[sec])) {
      if (scopes.some((scope) => name.startsWith(`${scope}/`))) {
        removed.push(`${name}@${pkg[sec][name]}`);
        delete pkg[sec][name];
      }
    }
    // clean up empty objects so npm doesn't complain
    if (pkg[sec] && Object.keys(pkg[sec]).length === 0) delete pkg[sec];
  }

  if (removed.length) {
    // keep a backup
    fs.writeFileSync(pkgPath + ".bak", fs.readFileSync(pkgPath, "utf8"));
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    // nuke lockfile & node_modules so resolution doesn't point to removed pkgs
    const lockPath = path.join(repoPath, "package-lock.json");
    if (fs.existsSync(lockPath)) fs.rmSync(lockPath, { force: true });
    const nmPath = path.join(repoPath, "node_modules");
    if (fs.existsSync(nmPath))
      fs.rmSync(nmPath, { recursive: true, force: true });
  }

  return { removed };
}

const tmpDir = path.join(os.tmpdir(), "bitbucket-repo-analyzer");
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

const runNpmOutdated = async (repoPath) => {
  console.log("running npm outdated...");
  try {
    const out = execSync("npm outdated --json", {
      cwd: repoPath,
      stdio: ["ignore", "pipe", "pipe"],
    }).toString();
    return JSON.parse(out);
  } catch (err) {
    // exit code 1 = outdated deps found (expected)
    if (err.status === 1 && err.stdout) {
      return JSON.parse(err.stdout.toString());
    }
    console.error("npm outdated failed:", err.message);
    return {};
  }
};

const runNpmAudit = async (repoPath) => {
  console.log("running npm audit (including dev deps)...");
  try {
    // NB: no --omit=dev so we get dev‐dep vulns too
    const out = execSync("npm audit --json", {
      cwd: repoPath,
      stdio: ["ignore", "pipe", "pipe"],
    }).toString();
    return JSON.parse(out);
  } catch (err) {
    // exit code 1 means vulnerabilities were found; stdout holds the JSON
    if (err.status === 1 && err.stdout) {
      return JSON.parse(err.stdout.toString());
    }
    // anything else is a genuine failure
    console.error("npm audit failed unexpectedly:", err.message);
    return { vulnerabilities: {}, metadata: {} };
  }
};

const checkNodeVersion = (repoPath) => {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(repoPath, "package.json"), "utf8")
    );
    if (pkg.engines?.node) {
      return { source: "package.json:engines.node", version: pkg.engines.node };
    }
  } catch (err) {
    console.log("Error checking Node version", err);
  }

  for (const fname of [".nvmrc", ".node-version"]) {
    const p = path.join(repoPath, fname);
    if (fs.existsSync(p)) {
      const v = fs.readFileSync(p, "utf8").trim();
      return { source: fname, version: v };
    }
  }

  return { source: "unspecified", version: null };
};

function installWithFallbacks(
  repoPath,
  fallbacks = ["22", "20", "18", "16", "14", "12", "10", "8", "6", "4", "2"]
) {
  console.log("Installing with fallbacks");
  console.log("Repo path:", repoPath);
  const base = { cwd: repoPath, stdio: "inherit", shell: "/bin/bash" };

  // 1) Clean modules (keep any existing lockfile)
  execSync("rm -rf node_modules package-lock.json", base);

  // 2) First install to recreate lockfile and modules
  console.log("Running initial npm install --ignore-scripts --omit=optional");
  execSync("npm install --ignore-scripts --omit=optional", base);

  // 3) Try npm ci under current Node
  const installCmd = "npm ci";
  const current = process.version.replace(/^v/, "");
  try {
    console.log(`Trying npm ci under Node ${current}`);
    execSync(installCmd, base);
    return current;
  } catch (err) {
    console.warn(`npm ci failed under Node ${current}:`, err.message);
  }

  // 4) Fallback through older Node versions via nvm
  for (const ver of fallbacks) {
    try {
      console.log(`Switching to Node ${ver} via nvm and reinstalling…`);
      execSync(
        `source ~/.nvm/nvm.sh && nvm install ${ver} && nvm use ${ver} && rm -rf node_modules package-lock.json && npm install --ignore-scripts --omit=optional && ${installCmd}`,
        base
      );
      return ver;
    } catch (err) {
      console.warn(`Still failing under Node ${ver}:`, err.message);
    }
  }

  throw new Error(
    `npm install failed under Node ${current} and all fallbacks: ${fallbacks.join(
      ", "
    )}`
  );
}

export async function runPreMaintenanceCheck(repo, options) {
  console.log(
    `Running pre-maintenance check on ${repo.slug} for branch: ${options?.branch}`
  );

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
    succeededNodeVersion: succeededNode,
  };
}
