Application Team:
The build keeps failing before deployment. We can see the namespace validation step is failing, but the application looks healthy from the service side.

Trident Team:
This usually happens when the namespace has not been registered or approved in the Trident registry. We need to verify the registry record before we look at the application code.

Application Team:
We set up the service account, but the validation is still reporting access issues. Are the permissions missing?

Trident Team:
That is likely the second check. Confirm the Trident service account has access to the project metadata and confirm the authorization token was refreshed after the last onboarding change.

Application Team:
So the fix is not a code rollback. It is more a registry and access issue.

Trident Team:
Exactly. Clear the registry issue, repair the service account permissions, and re-run validation. That should unblock the deployment without changing the application itself.
