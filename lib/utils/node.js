import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { execSync } from "child_process";

export const checkNodeVersion = (repoPath) => {
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

export const checkNodeVersionFromPipeline = (repoPath) => {
  console.log("checking node version in pipeline");
  try {
    const pipelinePath = path.join(repoPath, "bitbucket-pipelines.yml");
    console.log("pipeline path", pipelinePath);
    if (fs.existsSync(pipelinePath)) {
      const pipelineFile = yaml.load(fs.readFileSync(pipelinePath, "utf8"));
      const image =
        pipelineFile?.image ||
        pipelineFile?.definitions?.default?.image ||
        null;

      console.log("image", image);

      if (image && image.includes("node")) {
        const match = image.match(/node:(\d+(\.\d+)?(\.\d+)?)/);
        console.log("match", match);
        return {
          source: "bitbucket-pipelines.yml:node-image",
          version: match ? match[1] : image,
        };
      }
      if (image) {
        const semverMatch = image.match(/:(\d+\.\d+)/);
        if (semverMatch) {
          return {
            source: "bitbucket-pipelines.yml:image-semver",
            version: semverMatch[1],
          };
        }
      }
    }
  } catch (err) {
    console.log("Error checking Node version", err);
  }

  return { source: "unspecified", version: null };
};

export function installWithFallbacks(
  repoPath,
  fallbacks = ["22", "20", "18", "16", "14", "12", "10", "8", "6", "4", "2"]
) {
  console.log("Installing with fallbacks");
  console.log("Repo path:", repoPath);
  const base = { cwd: repoPath, stdio: "inherit", shell: "/bin/bash" };

  // 1) Clean out old modules
  execSync("rm -rf node_modules package-lock.json", base);

  // 2) First install (retry with legacy-peer-deps on any failure)
  console.log("-> npm install --ignore-scripts --omit=optional");
  try {
    execSync("npm install --ignore-scripts --omit=optional", base);
  } catch (err) {
    console.warn(
      "   Initial npm install failed, retrying with --legacy-peer-deps"
    );
    execSync(
      "npm install --ignore-scripts --omit=optional --legacy-peer-deps",
      base
    );
  }

  // 3) Try 'npm ci'
  const installCmd = "npm ci";
  const currentNode = process.version.replace(/^v/, "");
  try {
    console.log(`-> npm ci under Node ${currentNode}`);
    execSync(installCmd, base);
    return currentNode;
  } catch (ciErr) {
    console.warn(`   npm ci failed under Node ${currentNode}:`, ciErr.message);
  }

  // 4) Fallback through older Node versions
  for (const ver of fallbacks) {
    try {
      console.log(`-> Switching to Node ${ver} via nvm and reinstalling`);
      execSync(
        `source ~/.nvm/nvm.sh && nvm install ${ver} && nvm use ${ver} ` +
          `&& rm -rf node_modules package-lock.json ` +
          `&& npm install --ignore-scripts --omit=optional --legacy-peer-deps ` +
          `&& ${installCmd}`,
        base
      );
      return ver;
    } catch (fallbackErr) {
      console.warn(`   Still failing under Node ${ver}:`, fallbackErr.message);
    }
  }

  throw new Error(
    `npm install failed under Node ${currentNode} and all fallbacks`
  );
}
