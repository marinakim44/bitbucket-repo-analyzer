# Bitbucket Repo Analyzer

A light and fast CLI tool to scan all Bitbucket repositories in your workspace to speed up monthly audits and maintenance activities.

## Features

### CLI

- Scan all repos in a BitBucket workspace
- Detect:
  - Outdated npm packages
  - Outdated React and React Native versions
  - Outdated Node.js versions
  - Vulnerabilities
  - Keywords
- Works with monorepos + nested `package.json` via `--deep` flag
- Supports repo filtering via `--repos` or `--reposFile`
- Concurrency, progress bar, limiting to latest commit to ensure faster scans
- Output results to JSON for reporting

### API

- run pre-maintenance analysis (jobs queue)
- get jobs queue status
- get job status

## Set Environmental Variables

Set env vars in the terminal:

```bash
export BITBUCKET_USERNAME=your-username
export BITBUCKET_APP_PASSWORD=your-password
```

It's also possible to prefix the command with env vars:

```bash
BITBUCKET_USERNAME=username BITBUCKET_APP_PASSWORD=password npx bitbucket-repo-analyzer count --org=org-name
```

## Installation

Install globally:

```bash
npm install -g bitbucket-repo-analyzer
```

## Use without installation

You can execute it directly without installing.

```bash
npx bitbucket-repo-analyzer count --org=org-name
```

## Usage

### Check AWS SDK version across all repos:

```bash
bitbucket-repo-analyzer check aws-sdk --org=my-org
```

### Check React version across all repos:

```bash
bitbucket-repo-analyzer check react-version --org=my-org
```

### Scan specific repos:

Specify repos in a command:

```bash
bitbucket-repo-analyzer check aws-sdk --org=my-org --repos=repo-one,repo-two
```

Specify repos in a .txt file:

```bash
bitbucket-repo-analyzer check aws-sdk --org=my-org --reposFile=repos.txt
```

### Enable deep scan mode (look for package.json in nested folders)

```bash
bitbucket-repo-analyzer check aws-sdk --org=my-org --deep
```

### Check React versions

```bash
bitbucket-repo-analyzer check react-version --org=my-org
```

### Check React Native versions

```bash
bitbucket-repo-analyzer check react-native-version --org=my-org
```

### Search keyword across repos

```bash
bitbucket-repo-analyzer keyword <keyword> --org=my-org
```

For example

```bash
bitbucket-repo-analyzer keyword apilayer --org=my-org
```

### Count how many repos you have in Bitbucket

```bash
bitbucket-repo-analyzer count --org=my-org
```

## Output

A .json file is saved to the output/ folder.

## Roadmap

- Automatically create pull requests with npm upgrades
- Detect secrets: .env, .pem, hardcoded tokens
- GitHub / GitLab support

## Author

Built by Marina Kim  
GitHub: [@marinakim44](https://github.com/marinakim44)  
Founder of [CatBytes Community for Women in Tech](https://www.catbytes.io)
Co-organiser of [AWS User Group UK](https://www.meetup.com/awsuguk) and [AWS AI In Practice](https://www.meetup.com/awsuguk-ai-in-practice)

## License

MIT — use it, fork it, make it yours.
