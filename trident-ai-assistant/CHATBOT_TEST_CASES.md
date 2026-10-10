# Chatbot Evaluation Test Cases

Use these questions to manually test the chatbot on a system with Claude Code installed. This file is at the project root, not under `knowledge/`, so it is not included in retrieval.

Answers may be worded differently from the examples. Check that the key facts are correct, unsupported details are not invented, and the cited sources support the answer. The chatbot should use this four-section format:

```text
Answer
...

Possible Root Cause
...

Recommended Actions
1. ...

Reference Sources
- ...
```

## 1. Namespace validation failure

**Question**

Why can namespace validation fail even when the application configuration is complete?

**Expected output**

- **Answer:** The namespace may be missing from or unapproved in the Trident registry, or the cluster identity may not be allowlisted. Validation can fail before deployment even if application metadata/configuration is complete.
- **Possible Root Cause:** Missing namespace registration/approval or a missing cluster identity allowlist entry.
- **Recommended Actions:** Verify the namespace registry and approval, confirm the cluster identity allowlist, check service-account permissions, then rerun validation.
- **Reference Sources:** `onboarding.md` (Trident Onboarding); `jira_runbooks.md` (Jira Runbook Notes).

## 2. Onboarding access denied

**Question**

What should we investigate when onboarding returns an access denied error?

**Expected output**

- **Answer:** The Trident service account may not have the required read and write access to project metadata, often because permissions were not granted during provisioning.
- **Possible Root Cause:** Missing or incomplete service-account permissions.
- **Recommended Actions:** Check the permission set, correct it, and rerun validation.
- **Reference Sources:** `onboarding.md` (Trident Onboarding).

## 3. Migration validation failure

**Question**

What are the likely causes when migration validation fails before cutover?

**Expected output**

- **Answer:** Common causes include a namespace not registered or approved in the destination environment, mismatched environment variables, unavailable service-account credentials, or missing repository-token scopes when a package or image changes.
- **Possible Root Cause:** A destination registry/approval gap or stale/mismatched access configuration.
- **Recommended Actions:** Compare source and target registries, confirm the destination approval, verify environment variables and service-account access, check repository token scopes when relevant, and run a dry-run validation before cutover.
- **Reference Sources:** `migration_guide.md` (Trident Migration Guide).

## 4. Migration cutover checklist

**Question**

What checks should we complete before shifting traffic during a migration?

**Expected output**

- **Answer:** Confirm the destination namespace is registered and approved, validate environment variables, and verify that the Trident service account can read deployment manifests.
- **Possible Root Cause:** The target environment may not have the required approval or access configuration, even if the source environment is approved.
- **Recommended Actions:** Run a dry-run validation before the final traffic shift and do not bypass the registry check.
- **Reference Sources:** `migration_guide.md` (Trident Migration Guide); `office_hours_sessions/session_001.md` (session_001).

## 5. Migration decision record

**Question**

What information must be included in the migration decision record?

**Expected output**

- **Answer:** It must list the target namespace, approval timestamp, and owner.
- **Possible Root Cause:** Without the record, the team cannot demonstrate that the destination cluster had clean onboarding status before the activity window.
- **Recommended Actions:** Record and verify those three details before the migration activity window.
- **Reference Sources:** `migration_guide.md` (Trident Migration Guide).

## 6. Incident triage order

**Question**

In what order does the runbook recommend investigating namespace validation incidents?

**Expected output**

- **Answer:** Check the namespace registry record first, then service-account access, then deployment-secret rotation status.
- **Possible Root Cause:** A missing/unapproved registry entry, missing service-account access, or a stale deployment secret.
- **Recommended Actions:** Capture the affected namespace, owner, and latest validation run; document the error, suspected cause, owner, and mitigation before escalation; confirm the validator passes before closing.
- **Reference Sources:** `jira_runbooks.md` (Jira Runbook Notes).

## 7. Repository access incident

**Question**

Why can a repository access incident still show namespace validation as the first failing step?

**Expected output**

- **Answer:** Namespace validation is a gating check and can fail before repository access is checked; repository access may be a secondary issue.
- **Possible Root Cause:** A namespace/permission mismatch is blocking the pipeline before later checks run.
- **Recommended Actions:** Resolve the namespace and permission mismatch, verify registry and service-account access, then rerun the full deployment pipeline.
- **Reference Sources:** `office_hours_sessions/session_002.md` (session_002); `jira_runbooks.md` (Jira Runbook Notes).

## 8. Broad source-versus-target comparison

**Question**

Compare the source and destination requirements for namespace approval, credentials, and access before migration.

**Expected output**

- **Answer:** Source and destination registry states must be compared, but approval is environment-specific: the namespace must be registered and approved in the destination environment before cutover. The same service account and secret material should be present in both environments. During cutover, the service account must be able to read deployment manifests; repository-token scopes should also be checked when a package or image changes.
- **Possible Root Cause:** The destination may be missing its own approval or have credentials/access that do not match the source.
- **Recommended Actions:** Compare both registries, confirm destination approval, reconcile the service account and secret material, validate manifest/repository access, and run a dry-run before the traffic shift.
- **Reference Sources:** `migration_guide.md` (Trident Migration Guide); `office_hours_sessions/session_001.md` (session_001).
