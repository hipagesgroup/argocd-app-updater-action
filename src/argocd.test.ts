import {YAMLException} from 'js-yaml'
import {
  httpClient,
  HelmChartRepositories,
  readFromString,
  yamlReader,
  bestEffortReader,
  ApplicationReaderException,
  Application
} from './argocd'

// jest.mock('./argocd')

// const mockHttpClient = (argocd.httpClient as unknown) as jest.Mock

// import {httpClient as argocdHTTPClient, Application} from './argocd'

// const mockedAxios = axios as jest.Mocked<typeof axios>

const defaultApplicationYAML = `
apiVersion: argoproj.io/v1alpha1
metadata:
  name: "test"
  namespace: argocd
spec:
  syncPolicy: {}
  project: foobar
  destination:
    server: "https://kubernetes.default.svc"
    namespace: default
  source:
    repoURL: "https://helm-chart-repo/"
    chart: application
    targetRevision: 0.3.8
    helm:
      values: |-
        appName: "123"
`

const defaultRepositoryIndex = `
apiVersion: v1
entries:
  application:
  - apiVersion: v1
    appVersion: "1.0"
    created: "2020-11-05T02:54:10Z"
    description: A Helm chart for running stateless services on Kubernetes
    digest: 37349904d25a228d1d4690c240708a402132eebd942b8409611722489c5302bf
    home: https://github.com/hipagesgroup/charts/tree/master/charts/application
    maintainers:
    - name: arihantsurana
    - name: JoshVee
    name: application
    urls:
    - charts/application-0.3.8.tgz
    version: 0.3.8
`

httpClient.get = jest.fn()
const mockHttpClientGet = (httpClient.get as unknown) as jest.Mock

describe('argocd', () => {
  beforeEach(() => {
    // We're caching repositories to avoid unecessary calls, but it interferes with testing.
    Object.keys(HelmChartRepositories).map(
      key => delete HelmChartRepositories[key]
    )
  })

  it('should load argo app via string', async () => {
    mockHttpClientGet.mockResolvedValueOnce({data: defaultRepositoryIndex})

    const actual = await readFromString(defaultApplicationYAML)
    const expected: Application = {
      spec: {
        source: {
          repoURL: 'https://helm-chart-repo',
          targetRevision: '0.3.8',
          newTargetRevision: '',
          chart: 'application'
        }
      }
    }

    expect(actual).toMatchObject(expected)
  })

  it('should load argo app via string if chart is missing from repository index', async () => {
    const emptyRepositoryIndex = `
apiVersion: v1
entries: {}
`

    mockHttpClientGet.mockResolvedValueOnce({data: emptyRepositoryIndex})

    const actual = await readFromString(defaultApplicationYAML)
    const expected = {
      spec: {
        source: {
          repoURL: 'https://helm-chart-repo',
          targetRevision: '0.3.8',
          chart: 'application'
        }
      }
    } as Application

    expect(actual).toMatchObject(expected)
  })

  test('should strip trailing slash from spec.source.repoURL', async () => {
    const actual = await readFromString(defaultApplicationYAML)
    expect(actual.spec.source.repoURL).not.toMatch(new RegExp('/$'))
  })

  it('yamlReader should load yaml successfully', async () => {
    const actual = yamlReader(defaultApplicationYAML)
    const expected = {
      spec: {
        source: {
          repoURL: 'https://helm-chart-repo/',
          targetRevision: '0.3.8',
          chart: 'application'
        }
      }
    } as Application

    expect(actual).toMatchObject(expected)
  })

  it('yamlReader should throw error on invalid yaml', async () => {
    expect(() =>
      yamlReader('{{- if eq (getenv "GIT_BRANCH") "master" -}}')
    ).toThrow(YAMLException)
  })

  it('bestEffortReader should load yaml successfully', async () => {
    const actual = bestEffortReader(defaultApplicationYAML)
    const expected = {
      spec: {
        source: {
          repoURL: 'https://helm-chart-repo/',
          targetRevision: '0.3.8',
          chart: 'application'
        }
      }
    } as Application

    expect(actual).toMatchObject(expected)
  })

  it('bestEffortReader should throw error on invalid yaml', async () => {
    expect(() => bestEffortReader('foobar {{')).toThrow(
      ApplicationReaderException
    )
  })
})

// test('load chart repository successfully', async () => {
//   mockedAxios.get.mockResolvedValue({ data: {} })
//   mockedAxios.get.mockResolvedValue({data: {entries: {application: [{name: "application", version: "0.3.8"}]}}})
//   const index = await argocd.helmRepoIndex('https://helm-chart-repo/index.yaml')
//   await expect(index).toMatchObject({entries: {application: [{name: "application", version: "0.3.8"}]}})
// })

// test('load chart repository', async() => {
//   const index = argocd.helmRepoIndex('https://helm-chart-repo/index.yaml')
//   console.log(await index)
// })
