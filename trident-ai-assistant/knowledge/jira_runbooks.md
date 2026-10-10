# Jira Runbook Notes

The support workflow starts with incident classification and a review of namespace registration state. We capture the affected namespace, application owner, and the most recent validation run. The team then confirms whether the issue is a permissions problem, a namespace mismatch, or a failed migration gate.

When the namespace is not registered or approved, the validation check fails even if the application configuration is otherwise valid. The runbook recommends checking the registry record first, then the service account access, then the deployment secret rotation status. This order reduces unnecessary rework while preserving the audit trail.

The internal runbook calls for a concise status note before the incident is escalated. That note should include the validation error, the suspected root cause, the owner, and the mitigation action already taken. It keeps the follow-up thread aligned with the event timeline and prevents duplicate triage attempts.

In several cases, repository access was missing for the Trident service account. Once access was restored and validation was re-run, the issue cleared without a code change. The final remediation step is always to confirm the validator passes in the target environment before closing the ticket.
