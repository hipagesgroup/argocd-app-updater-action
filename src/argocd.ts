import yaml from 'js-yaml'
import axios, {AxiosResponse} from 'axios'
import axiosRetry from 'axios-retry'
import compareVersions, {compare} from 'compare-versions'

export type Application = {
  spec: {
    source: {
      repoURL: string
      chart: string
      targetRevision: string
      // TODO: name ok?
      newTargetRevision: string
    }
  }
}

export type VersionInfo = {
  type: string // semver, git
  revisionFrom: string
  revisionTo: string
  error: string
}

// export function readFromYAML(yaml: string): Application {
//     let app: Application = <Application>{};
//     return app
// }

export async function readFromString(data: string): Promise<Application> {
  // TODO: handle failures, e.g. if yaml cant be used regex parse the structure
  const app: Application = yaml.safeLoad(data) as Application

  // Remove trailing slash
  if (app.spec.source.repoURL.substr(-1) == '/') {
    app.spec.source.repoURL = app.spec.source.repoURL.slice(0, -1)
  }

  // TODO: Should this be done here?
  app.spec.source.newTargetRevision = await newerRevision(app)

  return app
}

export async function newerRevision(app: Application): Promise<string> {
  const index = await helmRepoIndex(`${app.spec.source.repoURL}/index.yaml`)
  const newTargetRevision = index.entries[app.spec.source.chart][0].version

  // Verify that both targetRevision and newTargetRevision are semver compliant.
  if (
    !compareVersions.validate(newTargetRevision) ||
    !compareVersions.validate(app.spec.source.targetRevision)
  ) {
    return ''
  }

  // Continue only if a new version is available
  if (
    compareVersions.compare(
      newTargetRevision,
      app.spec.source.targetRevision,
      '<='
    )
  ) {
    return ''
  }

  return newTargetRevision
}

const HelmChartRepositories: Record<
  string,
  Promise<HelmChartRepositoryIndex>
> = {}

type HelmChartRepositoryIndex = {
  entries: Record<string, HelmChartRepositoryChartVersion[]>
}

type HelmChartRepositoryChartVersion = {
  version: string
}

export async function helmRepoIndex(
  url: string
): Promise<HelmChartRepositoryIndex> {
  if (HelmChartRepositories[url]) {
    return HelmChartRepositories[url]
  }

  HelmChartRepositories[url] = (async (): Promise<HelmChartRepositoryIndex> => {
    axiosRetry(axios, {retries: 3, retryCondition: axiosRetry.isRetryableError})

    const result: AxiosResponse = await axios.get(url)

    return yaml.safeLoad(result.data) as HelmChartRepositoryIndex
  })()

  return HelmChartRepositories[url]
}
