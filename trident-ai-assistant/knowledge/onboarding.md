# Trident Onboarding

The onboarding process requires all namespaces to be registered before validation can complete. The namespace must be approved in the Trident registry before the application team can proceed with the service validation scan. In many incidents, the validation step fails because the cluster identity has not been added to the allowlist for the onboarding pipeline.

The platform team follows a staged flow for each new namespace: create the namespace, validate the service account permissions, verify the registry entry, then run the final validation workflow. If a namespace is missing from the central registry, the runtime check will fail even when the application metadata is otherwise complete.

Service account access is a common blocking issue. The onboarding check expects the Trident account to have read and write access to the project metadata. If the permissions were not granted during the provisioning step, the validation job will return an access denied error and the team must re-run the validation after the permission set is corrected.

The migration checklist also requires an approved namespace before any production cutover can be scheduled. This prevents the rollout from proceeding with stale environment variables or a partially registered configuration.
