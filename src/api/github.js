import { RequestError } from "octokit";

export async function generateRunnerJitconfig(
  context,
  name,
  labels,
  runner_group_id,
) {
  const { organization: org } = context.config;

  try {
    return await context.octokit.rest.actions.generateRunnerJitconfigForOrg({
      org,
      name,
      labels,
      runner_group_id,
    });
  } catch (error) {
    // If we obtain a conflict error this means that a runner with the same name already exists. This can happen
    // when a virtual machine is removed without removing the runner.
    if (error instanceof RequestError && error.status === 409) {
      const runners =
        await context.octokit.rest.actions.listSelfHostedRunnersForOrg({
          org,
          name,
        });

      if (runners.data.runners.length !== 1) {
        throw new Error("wrong number of runner returned while listing");
      }

      await context.octokit.rest.actions.deleteSelfHostedRunnerFromOrg({
        org,
        runner_id: runners.data.runners[0].id,
      });

      return await context.octokit.rest.actions.generateRunnerJitconfigForOrg({
        org,
        name,
        labels,
        runner_group_id,
      });
    }

    throw error;
  }
}
