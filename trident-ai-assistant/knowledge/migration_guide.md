# Trident Migration Guide

The migration process moves namespaces in waves. We start by comparing the source and target registries, then confirm the same service account and secret material are present in both environments. If the namespace is not registered in the destination cluster, the migration checker fails before the project gets a final approval.

During the cutover window, the team validates all environment variables and verifies that the Trident service account can read the deployment manifests. We often see a failure when the source cluster was approved in the old onboarding flow, but the new namespace was never added to the target environment approval list. The migration runbook calls for a dry-run validation before the final traffic shift.

When the rollout includes a package or image change, we also verify the repository access tokens and permission scopes. A common recovery step is to reissue the service account secret and re-run the migration validation. We do not skip the registry check because the application can appear healthy while the namespace policy still blocks the cutover.

The decision record should list the target namespace, approval timestamp, and owner. Without that record, the migration team cannot prove that the destination cluster had a clean onboarding status before the activity window begins.
