import simpleGit from "simple-git";

/**
 * Clones a Bitbucket repo into destDir (if missing).
 * repo: Bitbucket repo object
 * destDir: full path to clone into
 */
export async function cloneRepo(repo, destDir) {
  const git = simpleGit(path.dirname(destDir));
  const httpsClone = repo.links.clone.find((l) => l.name === "https").href;
  const sanitized = httpsClone.replace(/https:\/\/.*@/, "https://");
  const user = encodeURIComponent(process.env.BITBUCKET_USERNAME || "");
  const pass = encodeURIComponent(process.env.BITBUCKET_APP_PASSWORD || "");
  const url = sanitized.replace("https://", `https://${user}:${pass}@`);

  await git.clone(url, path.basename(destDir), ["--depth", "1"]);
}
