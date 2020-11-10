import axios from 'axios'
import * as argocd from '../src/argocd'

// jest.mock('axios')
// const mockedAxios = axios as jest.Mocked<typeof axios>

const defaultApplicationYAML: string = `
---
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
    repoURL: "https://chartmuseum.k8s.hipages.com.au/"
    chart: php-app
    targetRevision: 0.0.9
    helm:
      values: |-
        appName: "123"
`

const defaultRepositoryResponse: string = `
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

test('load argo app via string', async () => {
  const actual = await argocd.readFromString(defaultApplicationYAML)
  const expected: argocd.Application = <argocd.Application>{
    spec: {
      source: {
        repoURL: 'https://chartmuseum.k8s.hipages.com.au',
        targetRevision: '0.0.9',
        chart: 'php-app'
      }
    }
  }

  await expect(actual).toMatchObject(expected)
})

test('strip trailing slash from spec.source.repoURL', async () => {
  const actual = await argocd.readFromString(defaultApplicationYAML)
  await expect(actual.spec.source.repoURL).not.toMatch(new RegExp('/$'))
})

test('load chart repository successfully', async () => {
  // mockedAxios.get.mockResolvedValue({ data: {} })
  // mockedAxios.get.mockResolvedValue({data: {entries: {application: [{name: "application", version: "0.3.8"}]}}})
  // const index = await argocd.helmRepoIndex('https://chartmuseum.k8s.hipages.com.au/index.yaml')
  // await expect(index).toMatchObject({entries: {application: [{name: "application", version: "0.3.8"}]}})
})

// test('load chart repository', async() => {
//   const index = argocd.helmRepoIndex('https://chartmuseum.k8s.hipages.com.au/index.yaml')
//   console.log(await index)
// })

// test('wait 500 ms', async () => {
//   const start = new Date()
//   await wait(500)
//   const end = new Date()
//   var delta = Math.abs(end.getTime() - start.getTime())
//   expect(delta).toBeGreaterThan(450)
// })

// shows how the runner will run a javascript action with env / stdout protocol
// test('test runs', () => {
//   process.env['INPUT_MILLISECONDS'] = '500'
//   const ip = path.join(__dirname, '..', 'lib', 'main.js')
//   const options: cp.ExecSyncOptions = {
//     env: process.env
//   }
//   console.log(cp.execSync(`node ${ip}`, options).toString())
// })
