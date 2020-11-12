import {startGroup, info, endGroup, setFailed} from '@actions/core'
import {getOctokit, context as githubContext} from '@actions/github'
import multimatch from 'multimatch'
import md5 from 'md5'
import {readFromString} from './argocd'

// 1. Read from default branch to find if ArgoCD files exists
// 2. If yes, check if ArgoCD app is helm chart and requires update
// 3. If yes, create a branch for that app and update the file (e.g. argocd-app-update/<filename-hash>)
// 4. rinse repeat

async function run(): Promise<void> {
  try {
    const token = process.env.GITHUB_TOKEN || ''
    const octokit = getOctokit(token)
    const context = githubContext
    const filePatterns = ['.argocd**.yml']
    const repoInfo = await octokit.repos.get(context.repo)
    const baseBranchName = repoInfo.data?.default_branch
    const headBranchNamePrefix = 'argocd-app-update'

    // Find if the repo has files that match the defined pattern
    const {data: refData1} = await octokit.git.getRef({
      ...context.repo,
      ref: `heads/${baseBranchName}`
    })
    const getTreeResponse = await octokit.git.getTree({
      ...context.repo,
      // eslint-disable-next-line camelcase
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
      startGroup(`Processing file: ${treeItem.path}`)

      const headBranchName = `${headBranchNamePrefix}-${md5(treeItem.path)}`

      // Determine if the branch exists
      let branchExists = false
      try {
        await octokit.git.getRef({
          ...context.repo,
          ref: `heads/${headBranchName}`
        })
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

      info(`Determine if update is required from branch ${refUpdateBranch}`)

      const {data: file} = await octokit.repos.getContent({
        ...context.repo,
        ref: refUpdateBranch,
        path: treeItem.path
      })

      const fileContent = Buffer.from(file.content, 'base64').toString('ascii')
      const app = await readFromString(fileContent)

      info(
        `File ${file.path} uses chart ${app.spec.source.chart} version ${app.spec.source.targetRevision}`
      )

      // If update is not required, continue with the next file
      if (!app.spec.source.newTargetRevision) {
        info(`Skipping ${file.path}, no newer version available.`)
        endGroup()
        continue
      }

      // Update required, create branch if it doesn't exist
      if (!branchExists) {
        info(`Branch missing, creating branch ${headBranchName}`)
        const {data: refData2} = await octokit.git.getRef({
          ...context.repo,
          ref: `heads/${baseBranchName}`
        })
        await octokit.git.createRef({
          ...context.repo,
          ref: `refs/heads/${headBranchName}`,
          sha: refData2.object.sha
        })
      }

      // Get file from head branch, in case it did exists
      const {data: file2} = await octokit.repos.getContent({
        ...context.repo,
        ref: `heads/${headBranchName}`,
        path: treeItem.path
      })

      let fileContent2 = Buffer.from(file2.content, 'base64').toString('ascii')

      // core.info(`Found ${file.path} containing chart ${app.spec.source.chart} with version ${app.spec.source.targetRevision}`)
      // core.info(`Fetching repo index from ${app.spec.source.repoURL}/index.yaml for chart ${app.spec.source.chart}`)
      info(
        `Latest version for chart ${app.spec.source.chart} in index is ${app.spec.source.newTargetRevision}`
      )

      // core.info(`Skipping chart ${app.spec.source.chart}, no newer version available.`)

      fileContent2 = fileContent2.replace(
        `targetRevision: ${app.spec.source.targetRevision}`,
        `targetRevision: ${app.spec.source.newTargetRevision}`
      )

      info(
        `build(chart): bump ${app.spec.source.chart} from ${app.spec.source.targetRevision} to ${app.spec.source.newTargetRevision}`
      )
      await octokit.repos.createOrUpdateFileContents({
        ...context.repo,
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

      info(`Creating pull request`)
      await octokit.pulls.create({
        ...context.repo,
        title: `build(chart): bump ${app.spec.source.chart} from ${app.spec.source.targetRevision} to ${app.spec.source.newTargetRevision}`,
        head: `refs/heads/${headBranchName}`,
        base: `refs/heads/${baseBranchName}`,
        body: pullRequestBody,
        // eslint-disable-next-line camelcase
        maintainer_can_modify: true
      })

      endGroup()
    }
  } catch (error) {
    info(error)
    setFailed(error.message)
  }
}

run()
