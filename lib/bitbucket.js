import "dotenv/config";
import fetch from "node-fetch";

const BITBUCKET_API_URL = "https://api.bitbucket.org/2.0";

const BITBUCKET_USERNAME = process.env.BITBUCKET_USERNAME;
const BITBUCKET_APP_PASSWORD = process.env.BITBUCKET_APP_PASSWORD;

if (!BITBUCKET_USERNAME || !BITBUCKET_APP_PASSWORD) {
  console.error(
    "❌ Please set BITBUCKET_USERNAME and BITBUCKET_APP_PASSWORD as environment variables."
  );
  process.exit(1);
}

export async function getRepositories(org) {
  let page = 1;
  let repos = [];
  let url = `${BITBUCKET_API_URL}/repositories/${org}?pagelen=50`;

  while (url) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${BITBUCKET_USERNAME}:${BITBUCKET_APP_PASSWORD}`
        ).toString("base64")}`,
      },
    });

    const data = await res.json();

    if (data.error) {
      console.error(`❌ Bitbucket API error: ${data.error.message}`);
      process.exit(1);
    }

    repos = repos.concat(
      data.values.map((repo) => ({
        name: repo.name,
        slug: repo.slug,
        full_name: repo.full_name,
        links: repo.links,
      }))
    );

    url = data.next;
  }

  return repos;
}
