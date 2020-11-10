import * as core from '@actions/core'
import * as github from '@actions/github'
import multimatch from 'multimatch'
import md5 from 'md5'
import * as argocd from './argocd'
// import {wait} from './wait'

// Resources
// - https://github.com/octokit/rest.js/issues/845
// - https://github.com/octokit/rest.js/issues/1308

// type ArgoApplication = {
//   spec: {
//     source: {
//       repoURL: string
//       chart: string
//       targetRevision: string
//     }
//   }
// }

// type HelmChartRepositoryIndex = {
//   entries: Record<string, HelmChartRepositoryChartVersion[]>
// }

// type HelmChartRepositoryChartVersion = {
//   version: string
// }

// 1. Read from default branch to find if ArgoCD files exists
// 2. If yes, check if ArgoCD app is helm chart and requires update
// 3. If yes, create a branch for that app and update the file (e.g. argocd-app-update/<filename-hash>)
// 4. rinse repeat

async function run(): Promise<void> {
  try {
    const token = process.env.GITHUB_TOKEN || ''
    const octokit = github.getOctokit(token)
    const org = 'hipagesgroup'
    const repo = 'salesforce-syncer'
    const filePatterns = ['.argocd**.yml']
    const baseBranchName = 'master'
    const headBranchNamePrefix = 'argocd-app-update'
    const ctx = {owner: org, repo}

    // Find if the repo has files that match the defined pattern
    const {data: refData1} = await octokit.git.getRef({
      ...ctx,
      ref: `heads/${baseBranchName}`
    })
    const getTreeResponse = await octokit.git.getTree({
      ...ctx,
      tree_sha: refData1.object.sha,
      recursive: 'true'
    })

    const treeItems = (getTreeResponse.data?.tree || []).filter(function (
      element
    ) {
      return multimatch([element.path], filePatterns).length > 0
    })

    // Let's get to work and check those files
    for (const treeItem of treeItems) {
      core.startGroup(`Processing file: ${treeItem.path}`)

      const headBranchName = `${headBranchNamePrefix}-${md5(treeItem.path)}`

      // Determine if the branch exists
      let branchExists = false
      try {
        await octokit.git.getRef({...ctx, ref: `heads/${headBranchName}`})
        branchExists = true
      } catch (error) {
        // Bubble up if its not branch not found error.
        if (error.status !== 404) {
          throw error
        }
      }

      // Determine if update is required
      const refUpdateBranch = branchExists
        ? `heads/${headBranchName}`
        : `heads/${baseBranchName}`

      core.info(
        `Determine if update is required from branch ${refUpdateBranch}`
      )

      const {data: file} = await octokit.repos.getContent({
        ...ctx,
        ref: refUpdateBranch,
        path: treeItem.path
      })

      const fileContent = Buffer.from(file.content, 'base64').toString('ascii')
      const app = await argocd.readFromString(fileContent)

      core.info(
        `File ${file.path} uses chart ${app.spec.source.chart} version ${app.spec.source.targetRevision}`
      )

      // If update is not required, continue with the next file
      if (!app.spec.source.newTargetRevision) {
        core.info(`Skipping ${file.path}, no newer version available.`)
        core.endGroup()
        continue
      }

      // Update required, create branch if it doesn't exist
      if (!branchExists) {
        core.info(`Branch missing, creating branch ${headBranchName}`)
        const {data: refData2} = await octokit.git.getRef({
          ...ctx,
          ref: `heads/${baseBranchName}`
        })
        await octokit.git.createRef({
          ...ctx,
          ref: `refs/heads/${headBranchName}`,
          sha: refData2.object.sha
        })
      }

      // Get file from head branch, in case it did exists
      const {data: file2} = await octokit.repos.getContent({
        ...ctx,
        ref: `heads/${headBranchName}`,
        path: treeItem.path
      })

      let fileContent2 = Buffer.from(file2.content, 'base64').toString('ascii')

      // core.info(`Found ${file.path} containing chart ${app.spec.source.chart} with version ${app.spec.source.targetRevision}`)
      // core.info(`Fetching repo index from ${app.spec.source.repoURL}/index.yaml for chart ${app.spec.source.chart}`)
      core.info(
        `Latest version for chart ${app.spec.source.chart} in index is ${app.spec.source.newTargetRevision}`
      )

      // core.info(`Skipping chart ${app.spec.source.chart}, no newer version available.`)

      fileContent2 = fileContent2.replace(
        `targetRevision: ${app.spec.source.targetRevision}`,
        `targetRevision: ${app.spec.source.newTargetRevision}`
      )

      core.info(
        `build(chart): bump ${app.spec.source.chart} from ${app.spec.source.targetRevision} to ${app.spec.source.newTargetRevision}`
      )
      await octokit.repos.createOrUpdateFileContents({
        ...ctx,
        path: file2.path,
        message: `build(chart): bump ${app.spec.source.chart} from ${app.spec.source.targetRevision} to ${app.spec.source.newTargetRevision}`,
        content: Buffer.from(fileContent2, 'ascii').toString('base64'),
        sha: file2.sha,
        branch: `refs/heads/${headBranchName}`
      })

      const pullRequestBody = `
Bumps chart \`${app.spec.source.chart}\` from \`${app.spec.source.targetRevision}\` to \`${app.spec.source.newTargetRevision}\`.

**⚠️ Important**

Please ensure you have done your due diligence before merging. The checklist below will provide some pointers:

- [ ] Check the diff in ArgoCD and possibly adjust helm values if necessary
- [ ] Check the release log of the chart for breaking changes
      `.trim()

      core.info(`Creating pull request`)
      await octokit.pulls.create({
        owner: org,
        repo,
        title: `build(chart): bump ${app.spec.source.chart} from ${app.spec.source.targetRevision} to ${app.spec.source.newTargetRevision}`,
        head: `refs/heads/${headBranchName}`,
        base: `refs/heads/${baseBranchName}`,
        body: pullRequestBody,
        maintainer_can_modify: true
      })

      core.endGroup()
    }
  } catch (error) {
    core.info(error)
    core.setFailed(error.message)
  }
}

run()
