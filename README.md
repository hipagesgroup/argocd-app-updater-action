# argocd-app-updater-action

Automatically update ArgoCD application manifests via pull requests.

`argocd-app-updater-action` is a GitHub action which is used to update the helm chart version within an ArgoCD application manifest.
The action runs either as a scheduled job or can be executed manually.
It will check the chart registry for the latest chart version and if an update is available a pull request is created with the updated manifest.
