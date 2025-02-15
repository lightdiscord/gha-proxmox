import { Client } from "./api/proxmox.js";
import { parsePropertyList, sleep, stringifyPropertyList } from "./utils.js";
import jwt from "jsonwebtoken";
import Fastify from "fastify";
import { generateRunnerJitconfig } from "./api/github.js";
import { Octokit } from "octokit";
import { createAppAuth } from "@octokit/auth-app";
import * as fs from "node:fs/promises";
import pino from "pino";
import { schema } from "./env.js";

const logger = pino();

async function reconciliate(config, proxmox) {
  logger.debug("starting new reconciliation loop");

  const now = Date.now();

  let [{ members }] = await proxmox.listPoolMembers(
    config.PROXMOX_POOL,
    "qemu",
  );

  // Filter elements to only handle virtual machines on the targeted node and in the target range.
  members = members.filter(
    ({ node, vmid }) =>
      node === config.PROXMOX_NODE &&
      vmid >= config.PROXMOX_MIN_VMID &&
      vmid <= config.PROXMOX_MAX_VMID,
  );

  for (const member of members) {
    const subLogger = logger.child({ node: member.node, vmid: member.vmid });

    const qemuConfig = await proxmox.qemuConfig(member.node, member.vmid);
    const meta = parsePropertyList(qemuConfig.meta);

    const creation = (parseInt(meta.ctime) || 0) * 1000;
    const age = now - creation;

    if (
      config.MAXIMUM_AGE > 0 &&
      member.status === "running" &&
      age >= 1000 * 60 * config.MAXIMUM_AGE
    ) {
      subLogger.info("stopping qemu machine because of old age");

      const task = await proxmox.qemuSetStatus(
        member.node,
        member.vmid,
        "stop",
      );

      await proxmox.waitTask(member.node, task);

      // Mark the member as stopped to ensure it gets deleted in the next check.
      member.status = "stopped";
    }

    // Delay to ensure the system has time to starts, if the system is stopped after the grace period
    // it means the runner has finished or an error occured while starting the instance.
    if (member.status === "stopped" && age >= 1000 * 60 * 2) {
      subLogger.info("deleting stopped qemu machine");

      const task = await proxmox.qemuDelete(member.node, member.vmid);
      await proxmox.waitTask(member.node, task);
    }
  }

  for (let i = members.length; i < config.MINIMUM_RUNNERS; i++) {
    let newid;

    for (let j = config.PROXMOX_MIN_VMID; j <= config.PROXMOX_MAX_VMID; j++) {
      if (!members.some(({ vmid }) => vmid === j)) {
        newid = j;

        // Push fake member to prevent reusing vmid
        members.push({ vmid: newid });
        break;
      }
    }

    if (!newid) {
      logger.error("range of virtual machine id is full");
      break;
    }

    try {
      logger.info(
        { node: config.PROXMOX_NODE, vmid: newid },
        "cloning virtual machine",
      );

      const name = `gha-runner-${newid}`;
      const task = await proxmox.qemuClone(
        config.PROXMOX_NODE,
        config.PROXMOX_VMID,
        newid,
        {
          name,
          pool: config.PROXMOX_POOL,
          full: config.PROXMOX_FULL_CLONE,
        },
      );

      await proxmox.waitTask(config.PROXMOX_NODE, task);

      const token = jwt.sign({ name }, config.JWT_SECRET, {
        algorithm: "HS256",
        expiresIn: "5m",
      });

      const qemuConfig = await proxmox.qemuConfig(config.PROXMOX_NODE, newid);

      const smbios1 = parsePropertyList(qemuConfig.smbios1);
      smbios1["serial"] = btoa(
        `ds=nocloud;s=${config.PUBLIC_URL}/cloud-init/${token}/`,
      );
      smbios1["base64"] = 1;

      await proxmox.qemuSetConfig(config.PROXMOX_NODE, newid, {
        smbios1: stringifyPropertyList(smbios1),
      });

      await proxmox.qemuSetStatus(config.PROXMOX_NODE, newid, "start");
    } catch (e) {
      logger.error(e, "error while creating virtual machine");
    }
  }

  await sleep(5000);
}

async function main() {
  const result = await schema.safeParseAsync(process.env);

  if (!result.success) {
    for (const error of result.error.errors) {
      logger.fatal({ error }, "invalid configuration");
    }
    return;
  }

  const config = result.data;

  const proxmox = new Client({
    url: config.PROXMOX_URL,
    token: config.PROXMOX_TOKEN,
    insecureTls: config.PROXMOX_INSECURE_TLS,
  });

  const fastify = Fastify({
    // Since JWT are passed as route parameters, this is required because they're longer than the default maximum.
    maxParamLength: 500,
    loggerInstance: logger,
  });

  const privateKey = (
    await fs.readFile(config.GITHUB_PRIVATE_KEY_FILE)
  ).toString();
  const userData = (await fs.readFile(config.USER_DATA_FILE)).toString();

  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: config.GITHUB_CLIENT_ID,
      installationId: config.GITHUB_INSTALLATION_ID,
      privateKey,
    },
  });

  fastify.get("/cloud-init/:token/user-data", async (request) => {
    const claims = jwt.verify(request.params.token, config.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    const encoded_jit_config = await generateRunnerJitconfig(
      {
        config: {
          organization: config.GITHUB_ORGANIZATION,
        },
        octokit,
      },
      claims.name,
      ["self-hosted", ...config.LABELS.split(",")],
      config.GITHUB_RUNNER_GROUP_ID,
    );

    return userData
      .replaceAll("{{name}}", claims.name)
      .replaceAll(
        "{{encoded_jit_config}}",
        encoded_jit_config.data.encoded_jit_config,
      );
  });

  fastify.get("/cloud-init/:token/meta-data", async (_request, reply) => {
    reply.statusCode = 204;
  });

  fastify.get("/cloud-init/:token/vendor-data", async (_request, reply) => {
    reply.statusCode = 204;
  });

  fastify.get("/cloud-init/:token/network-config", async (_request, reply) => {
    reply.statusCode = 204;
  });

  fastify.listen({
    host: config.HOST,
    port: config.PORT,
  });

  while (true) {
    try {
      await reconciliate(config, proxmox);
    } catch (e) {
      logger.error(e, "error during reconciliation");
    }
  }
}

await main();
