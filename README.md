[![Link to argocd-app-updater-action in hipages Developer Portal, Component: argocd-app-updater-action](https://backyard.k8s.hipages.com.au/api/badges/entity/default/Component/argocd-app-updater-action/badge/pingback "Link to argocd-app-updater-action in hipages Developer Portal")](https://backyard.k8s.hipages.com.au/catalog/default/Component/argocd-app-updater-action)
[![Entity owner badge, owner: platform](https://backyard.k8s.hipages.com.au/api/badges/entity/default/Component/argocd-app-updater-action/badge/owner "Entity owner badge")](https://backyard.k8s.hipages.com.au/catalog/default/Component/argocd-app-updater-action)
# argocd-app-updater-action

Automatically update ArgoCD application manifests via pull requests.

`argocd-app-updater-action` is a GitHub action which is used to update the helm chart version within an ArgoCD application manifest.
The action runs either as a scheduled job or can be executed manually.
It will check the chart registry for the latest chart version and if an update is available a pull request is created with the updated manifest.


## Features

- Run as GitHub Action per-repository or across multiple repositories (requires personal access token)

## Debug

INPUT_DRYRUN=true INPUT_ALLREPOS=true INPUT_FILES='.argocd**.y*ml' GITHUB_REPOSITORY=<myorg>/<myrepo> ts-node src/main.ts
