# argocd-app-updater-action

A GitHub action to update the helm chart version used within an ArgoCD application manifest.

`argocd-app-updater-action` will check the chart registry for the latest chart version.
If an update is available a pull request is created with the updated manifest.

It is meant to run as a scheduled job or to be manually executed.
