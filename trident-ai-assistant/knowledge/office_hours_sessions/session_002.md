Application Team:
We are preparing for migration and the traffic shift is being blocked by the validation gate.

Trident Team:
The migration runbook always checks the destination cluster namespace first. If it is not registered in the target environment, the validator will fail even when the application artifact is correct.

Application Team:
We assumed the namespace had already been approved because it exists in the source cluster.

Trident Team:
Approval is environment-specific. The source and target environments are treated separately, and the approval record must exist in the destination environment before the cutover is scheduled.

Application Team:
What should we do next?

Trident Team:
Validate the target namespace entry, confirm the service account permissions, and run a dry-run validation before the actual migration. If the permission set is stale, refresh the access token and re-run the migration checks.
