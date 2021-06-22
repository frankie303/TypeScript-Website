// This script relies on getTypeScriptNPMVersions.js having been ran already
// node packages/typescriptlang-org/scripts/getTypeScriptReleaseInfo.js

const Octokit = require("@octokit/rest")
const versionMeta = require("../src/lib/release-info.json")
const fetch = require("node-fetch")
const { format } = require("prettier")
const { writeFileSync, existsSync } = require("fs")
const { join, dirname } = require("path")

const token = process.env.GITHUB_BOT_TOKEN || process.env.GITHUB_TOKEN
if (!token) throw new Error("No GitHub Token at process.env.GITHUB_BOT_TOKEN")

const go = async () => {
  const octokit = new Octokit({
    auth: token,
    userAgent: "TS Website Issue Searcher",
  })

  const issues = await octokit.search.issuesAndPullRequests({
    q: "iteration plan repo:microsoft/typescript state:open type:issues",
  })

  const upcoming = issues.data.items.find(
    i =>
      i.title.toLowerCase().includes(versionMeta.tags.next) &&
      i.labels.find(l => l.name === "Planning")
  )

  // Couldn't find the issue, bail,
  if (!upcoming) {
    return sendTeamsFail(
      `Could not find an iteration plan issue for ${versionMeta.tags.next} during the most recent site deploy - see https://github.com/microsoft/TypeScript-website/blob/v2/packages/typescriptlang-org/scripts/getTypeScriptReleaseInfo.js`
    )
  }

  const lines = upcoming.body.toLowerCase().split("\n")
  const lastRelease = lines.find(
    l =>
      l.includes(`${versionMeta.tags.stableMajMin} release`) && l.includes("|")
  )
  const beta = lines.find(
    l => l.includes(`${versionMeta.tags.next} beta release`) && l.includes("|")
  )

  const rc = lines.find(
    l => l.includes(`${versionMeta.tags.next} rc release`) && l.includes("|")
  )

  const release = lines.find(
    l => l.includes(`${versionMeta.tags.next} final release`) && l.includes("|")
  )

  // Making sure we got good data
  const dates = {
    lastRelease,
    beta,
    rc,
    release,
  }
  const missing = []
  Object.keys(dates).forEach(key => {
    if (!dates[key]) {
      missing.push(key)
    }
  })
  if (missing.length) {
    // prettier-ignore
    return sendTeamsFail(`Could not parse the md table for ${missing.join(",")} in https://github.com/microsoft/TypeScript/issues/${upcoming.number} - see https://github.com/microsoft/TypeScript-website/blob/v2/packages/typescriptlang-org/scripts/getTypeScriptReleaseInfo.js`)
  }

  // "june 29th      | **typescript 4.4 beta release**\r" -> Date
  const toDate = str => {
    const date = str.split("|")[0].trim()
    const components = date.split(" ")
    const month = components[0]
    const day = components[1].replace("th", "").replace("st", "")
    const thisYear = new Date().getFullYear()
    const year = parseInt(components[2]) || thisYear
    return new Date(`${month} ${day} ${year}`).toISOString()
  }

  const results = {
    "_generated by":
      "node packages/typescriptlang-org/scripts/getTypeScriptReleaseInfo.js",
    upcoming_version: versionMeta.tags.next,
    iteration_plan_url: `https://github.com/microsoft/TypeScript/issues/${upcoming.number}`,
    last_release_date: toDate(lastRelease),
    upcoming_beta_date: toDate(beta),
    upcoming_rc_date: toDate(rc),
    upcoming_release_date: toDate(release),
  }
  const jsonPath = join(__dirname, "..", "src", "lib", "release-plan.json")

  writeFileSync(
    jsonPath,
    format(JSON.stringify(results), { filepath: jsonPath })
  )
}

go()

const sendTeamsFail = title => {
  const teamsURL = process.env.TEAMS_WEB_BOT_INCOMING_URL
  const message = {
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    summary: "Website issue",
    themeColor: "0078D7",
    title,
  }

  fetch(teamsURL, {
    method: "post",
    body: JSON.stringify(message),
    headers: { "Content-Type": "application/json" },
  })
}
