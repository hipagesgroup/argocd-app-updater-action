import yaml from 'js-yaml'
import axios, {AxiosInstance, AxiosResponse} from 'axios'
// import axiosRetry from 'axios-retry'
import compareVersions from 'compare-versions'

export interface Application {
  spec: {
    source: {
      repoURL: string
      chart: string
      targetRevision: string
      // TODO: name ok?
      newTargetRevision?: string
    }
  }
}

export interface VersionInfo {
  type: string // semver, git
  revisionFrom: string
  revisionTo: string
  error: string
}

// export function readFromYAML(yaml: string): Application {
//     let app: Application = <Application>{};
//     return app
// }

export const httpClient: AxiosInstance = axios.create()

// interface ApplicationReaderInterface {
//   readFromString(data: string): Application
// }

// class ApplicationReader implements ApplicationReaderInterface {
//   strategies: ApplicationReaderInterface[] = [
//     new ApplicationReaderYaml(),
//     new ApplicationReaderBestEffort()
//   ]

//   readFromString(data: string): Application {
//     for (const strategy of this.strategies) {
//       try {
//         return strategy.readFromString(data)
//       } catch (error) {
//         continue
//       }
//     }

//     throw new Error('Invalid ArgoCD manifest or unknown format.')
//   }
// }

// class ApplicationReaderYaml implements ApplicationReaderInterface {
//   readFromString(data: string): Application {
//     throw new Error('Method not implemented.')
//   }
// }

// class ApplicationReaderBestEffort implements ApplicationReaderInterface {
//   readFromString(data: string): Application {
//     throw new Error('Method not implemented.')
//   }
// }

type ApplicationReader = (data: string) => Application
export class ApplicationReaderException extends Error {}

// Reads a string in YAML format and returns an ArgoCD application
export const yamlReader: ApplicationReader = (data: string) => {
  return yaml.safeLoad(data) as Application
}

// Reads a string in unknown format and returns an ArgoCD application
export const bestEffortReader: ApplicationReader = (data: string) => {
  // TODO: Ideally we should check for the following:
  // - contains "apiVersion: argoproj.io/v1alpha1"
  // - contains "kind: Application"

  const regexp = /(?<key>repoURL|chart|targetRevision): (?<value>.+)/g

  type AdjustedRegex = RegExpExecArray & {groups: {}}
  const matches = data.matchAll(regexp)

  if (Array.from(matches).length === 0) {
    throw new ApplicationReaderException(
      'ApplicationReaderException: Unable to read application manifest.'
    )
  }

  const app: Application = {
    spec: {source: {repoURL: '', chart: '', targetRevision: ''}}
  }

  // TODO: Figure out how to use named captured groups
  for (const match of matches) {
    switch (match[1]) {
      case 'repoURL':
        app.spec.source.repoURL = match[2].replace(/^['"](.+)['"]$/, '$1')
        break
      case 'chart':
        app.spec.source.chart = match[2]
        break
      case 'targetRevision':
        app.spec.source.targetRevision = match[2]
        break
    }
  }

  return app
}

export const applicationReader: ApplicationReader = (data: string) => {
  for (const reader of [yamlReader, bestEffortReader]) {
    try {
      return reader(data)
    } catch (error) {
      continue
    }
  }

  throw new ApplicationReaderException(
    'ApplicationReaderException: Unable to read application manifest.'
  )
}

export async function readFromString(data: string): Promise<Application> {
  // TODO: handle failures, e.g. if yaml cant be used regex parse the structure
  const app: Application = applicationReader(data)

  // Remove trailing slash
  if (app.spec.source.repoURL.substr(-1) === '/') {
    app.spec.source.repoURL = app.spec.source.repoURL.slice(0, -1)
  }

  // TODO: Should this be done here?
  app.spec.source.newTargetRevision = await newerRevision(app)

  return app
}

export async function newerRevision(app: Application): Promise<string> {
  const {entries = {}} = await helmRepoIndex(
    `${app.spec.source.repoURL}/index.yaml`
  )

  // Verify that a chart entry exists
  if (
    !(app.spec.source.chart in entries) ||
    entries[app.spec.source.chart].length === 0
  ) {
    return ''
  }

  const newTargetRevision = entries[app.spec.source.chart][0].version

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

export const HelmChartRepositories: Record<
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
    // TODO: revisit
    // axiosRetry(axios, {retries: 3, retryCondition: axiosRetry.isRetryableError})

    try {
      // const result: AxiosResponse = await axios.get(url)
      const result: AxiosResponse = await httpClient.get(url)

      return yaml.safeLoad(result.data) as HelmChartRepositoryIndex
    } catch (error) {
      return {} as HelmChartRepositoryIndex
    }
  })()

  return HelmChartRepositories[url]
}
