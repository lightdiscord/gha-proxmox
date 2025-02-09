import { App, Octokit, RequestError } from "octokit";
import { createAppAuth } from "@octokit/auth-app";

export async function generateRunnerJitconfig(context, name, labels, runner_group_id) {
  const { organization: org } = context.config;

  try {
    console.log("try generating jitconfig")
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
      console.log("try listing self hosted runner for jitconfig")
      const runners =
        await context.octokit.rest.actions.listSelfHostedRunnersForOrg({
          org,
          name,
        });

      if (runners.data.runners.length !== 1) {
        throw new Error("wrong number of runner returned while listing");
      }

      console.log("try deleting self hosted runner for jitconfig")
      await context.octokit.rest.actions.deleteSelfHostedRunnerFromOrg({
        org,
        runner_id: runners.data.runners[0].id,
      });

      console.log("try generating jitconfig second time")
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
