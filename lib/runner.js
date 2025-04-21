import { getRepositories } from "./bitbucket.js";
import { checkAwsSdk } from "./checks/aws-sdk.js";
import logUpdate from "log-update";
import pLimit from "p-limit";
import fs from "fs";
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputPath = `output/aws-sdk-results-${timestamp}.json`;

const limit = pLimit(5);

const checks = {
  "aws-sdk": checkAwsSdk,
  // Add more checks here later
};

export async function runAnalyzer(
  checkName,
  org,
  reposFilter = null,
  options = {}
) {
  const checkFn = checks[checkName];
  if (!checkFn) {
    console.error(`❌ Unknown check: ${checkName}`);
    return;
  }

  console.log(`🔍 Running "${checkName}" check for Bitbucket org "${org}"...`);

  let repos = await getRepositories(org);

  if (reposFilter) {
    repos = repos.filter((r) => reposFilter.includes(r.slug));
    console.log(`🎯 Filtering to ${repos.length} specific repos...`);
  }

  if (!repos.length) {
    console.log("No repositories found.");
    return;
  }

  const logs = [];
  const total = repos.length;
  let completed = 0;

  await Promise.all(
    repos.map((repo) =>
      limit(async () => {
        const result = await checkFn(repo, options);
        completed++;

        if (result) {
          logs.push(result);
        }

        const progressBar = generateProgressBar(completed, total);
        logUpdate(`${progressBar} ${completed}/${total} Repos`);
      })
    )
  );

  logUpdate.done();

  fs.mkdirSync("output", { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(logs, null, 2));

  console.log(`\n✅ Done! ${repos.length} repositories analyzed.`);
  console.log(`📁 Results saved to ${outputPath}`);
}

function generateProgressBar(completed, total, length = 40) {
  const ratio = completed / total;
  const filled = Math.round(ratio * length);
  const empty = length - filled;
  return `Progress |${"█".repeat(filled)}${"░".repeat(empty)}|`;
}
