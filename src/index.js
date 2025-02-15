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

async function main() {
  const logger = pino({
    level: "debug",
  });

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

  const privateKey = (await fs.readFile(config.GITHUB_PRIVATE_KEY)).toString();

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

    return `#cloud-config

hostname: ${claims.name}

users:
  - name: runner
    sudo: ["ALL=(ALL) NOPASSWD:ALL"]
    shell: /bin/bash
    groups:
      - docker
    ssh_authorized_keys:
      - ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOwPjxVa7FqHlqhmG83bVaEc6ENIeH5svCTiUhlzQzOY root@arnaud.sh

apt:
  sources:
    docker.list:
      source: deb [arch=amd64 signed-by=$KEY_FILE] https://download.docker.com/linux/ubuntu $RELEASE stable
      key: |
        -----BEGIN PGP PUBLIC KEY BLOCK-----
        
        mQINBFit2ioBEADhWpZ8/wvZ6hUTiXOwQHXMAlaFHcPH9hAtr4F1y2+OYdbtMuth
        lqqwp028AqyY+PRfVMtSYMbjuQuu5byyKR01BbqYhuS3jtqQmljZ/bJvXqnmiVXh
        38UuLa+z077PxyxQhu5BbqntTPQMfiyqEiU+BKbq2WmANUKQf+1AmZY/IruOXbnq
        L4C1+gJ8vfmXQt99npCaxEjaNRVYfOS8QcixNzHUYnb6emjlANyEVlZzeqo7XKl7
        UrwV5inawTSzWNvtjEjj4nJL8NsLwscpLPQUhTQ+7BbQXAwAmeHCUTQIvvWXqw0N
        cmhh4HgeQscQHYgOJjjDVfoY5MucvglbIgCqfzAHW9jxmRL4qbMZj+b1XoePEtht
        ku4bIQN1X5P07fNWzlgaRL5Z4POXDDZTlIQ/El58j9kp4bnWRCJW0lya+f8ocodo
        vZZ+Doi+fy4D5ZGrL4XEcIQP/Lv5uFyf+kQtl/94VFYVJOleAv8W92KdgDkhTcTD
        G7c0tIkVEKNUq48b3aQ64NOZQW7fVjfoKwEZdOqPE72Pa45jrZzvUFxSpdiNk2tZ
        XYukHjlxxEgBdC/J3cMMNRE1F4NCA3ApfV1Y7/hTeOnmDuDYwr9/obA8t016Yljj
        q5rdkywPf4JF8mXUW5eCN1vAFHxeg9ZWemhBtQmGxXnw9M+z6hWwc6ahmwARAQAB
        tCtEb2NrZXIgUmVsZWFzZSAoQ0UgZGViKSA8ZG9ja2VyQGRvY2tlci5jb20+iQI3
        BBMBCgAhBQJYrefAAhsvBQsJCAcDBRUKCQgLBRYCAwEAAh4BAheAAAoJEI2BgDwO
        v82IsskP/iQZo68flDQmNvn8X5XTd6RRaUH33kXYXquT6NkHJciS7E2gTJmqvMqd
        tI4mNYHCSEYxI5qrcYV5YqX9P6+Ko+vozo4nseUQLPH/ATQ4qL0Zok+1jkag3Lgk
        jonyUf9bwtWxFp05HC3GMHPhhcUSexCxQLQvnFWXD2sWLKivHp2fT8QbRGeZ+d3m
        6fqcd5Fu7pxsqm0EUDK5NL+nPIgYhN+auTrhgzhK1CShfGccM/wfRlei9Utz6p9P
        XRKIlWnXtT4qNGZNTN0tR+NLG/6Bqd8OYBaFAUcue/w1VW6JQ2VGYZHnZu9S8LMc
        FYBa5Ig9PxwGQOgq6RDKDbV+PqTQT5EFMeR1mrjckk4DQJjbxeMZbiNMG5kGECA8
        g383P3elhn03WGbEEa4MNc3Z4+7c236QI3xWJfNPdUbXRaAwhy/6rTSFbzwKB0Jm
        ebwzQfwjQY6f55MiI/RqDCyuPj3r3jyVRkK86pQKBAJwFHyqj9KaKXMZjfVnowLh
        9svIGfNbGHpucATqREvUHuQbNnqkCx8VVhtYkhDb9fEP2xBu5VvHbR+3nfVhMut5
        G34Ct5RS7Jt6LIfFdtcn8CaSas/l1HbiGeRgc70X/9aYx/V/CEJv0lIe8gP6uDoW
        FPIZ7d6vH+Vro6xuWEGiuMaiznap2KhZmpkgfupyFmplh0s6knymuQINBFit2ioB
        EADneL9S9m4vhU3blaRjVUUyJ7b/qTjcSylvCH5XUE6R2k+ckEZjfAMZPLpO+/tF
        M2JIJMD4SifKuS3xck9KtZGCufGmcwiLQRzeHF7vJUKrLD5RTkNi23ydvWZgPjtx
        Q+DTT1Zcn7BrQFY6FgnRoUVIxwtdw1bMY/89rsFgS5wwuMESd3Q2RYgb7EOFOpnu
        w6da7WakWf4IhnF5nsNYGDVaIHzpiqCl+uTbf1epCjrOlIzkZ3Z3Yk5CM/TiFzPk
        z2lLz89cpD8U+NtCsfagWWfjd2U3jDapgH+7nQnCEWpROtzaKHG6lA3pXdix5zG8
        eRc6/0IbUSWvfjKxLLPfNeCS2pCL3IeEI5nothEEYdQH6szpLog79xB9dVnJyKJb
        VfxXnseoYqVrRz2VVbUI5Blwm6B40E3eGVfUQWiux54DspyVMMk41Mx7QJ3iynIa
        1N4ZAqVMAEruyXTRTxc9XW0tYhDMA/1GYvz0EmFpm8LzTHA6sFVtPm/ZlNCX6P1X
        zJwrv7DSQKD6GGlBQUX+OeEJ8tTkkf8QTJSPUdh8P8YxDFS5EOGAvhhpMBYD42kQ
        pqXjEC+XcycTvGI7impgv9PDY1RCC1zkBjKPa120rNhv/hkVk/YhuGoajoHyy4h7
        ZQopdcMtpN2dgmhEegny9JCSwxfQmQ0zK0g7m6SHiKMwjwARAQABiQQ+BBgBCAAJ
        BQJYrdoqAhsCAikJEI2BgDwOv82IwV0gBBkBCAAGBQJYrdoqAAoJEH6gqcPyc/zY
        1WAP/2wJ+R0gE6qsce3rjaIz58PJmc8goKrir5hnElWhPgbq7cYIsW5qiFyLhkdp
        YcMmhD9mRiPpQn6Ya2w3e3B8zfIVKipbMBnke/ytZ9M7qHmDCcjoiSmwEXN3wKYI
        mD9VHONsl/CG1rU9Isw1jtB5g1YxuBA7M/m36XN6x2u+NtNMDB9P56yc4gfsZVES
        KA9v+yY2/l45L8d/WUkUi0YXomn6hyBGI7JrBLq0CX37GEYP6O9rrKipfz73XfO7
        JIGzOKZlljb/D9RX/g7nRbCn+3EtH7xnk+TK/50euEKw8SMUg147sJTcpQmv6UzZ
        cM4JgL0HbHVCojV4C/plELwMddALOFeYQzTif6sMRPf+3DSj8frbInjChC3yOLy0
        6br92KFom17EIj2CAcoeq7UPhi2oouYBwPxh5ytdehJkoo+sN7RIWua6P2WSmon5
        U888cSylXC0+ADFdgLX9K2zrDVYUG1vo8CX0vzxFBaHwN6Px26fhIT1/hYUHQR1z
        VfNDcyQmXqkOnZvvoMfz/Q0s9BhFJ/zU6AgQbIZE/hm1spsfgvtsD1frZfygXJ9f
        irP+MSAI80xHSf91qSRZOj4Pl3ZJNbq4yYxv0b1pkMqeGdjdCYhLU+LZ4wbQmpCk
        SVe2prlLureigXtmZfkqevRz7FrIZiu9ky8wnCAPwC7/zmS18rgP/17bOtL4/iIz
        QhxAAoAMWVrGyJivSkjhSGx1uCojsWfsTAm11P7jsruIL61ZzMUVE2aM3Pmj5G+W
        9AcZ58Em+1WsVnAXdUR//bMmhyr8wL/G1YO1V3JEJTRdxsSxdYa4deGBBY/Adpsw
        24jxhOJR+lsJpqIUeb999+R8euDhRHG9eFO7DRu6weatUJ6suupoDTRWtr/4yGqe
        dKxV3qQhNLSnaAzqW/1nA3iUB4k7kCaKZxhdhDbClf9P37qaRW467BLCVO/coL3y
        Vm50dwdrNtKpMBh3ZpbB1uJvgi9mXtyBOMJ3v8RZeDzFiG8HdCtg9RvIt/AIFoHR
        H3S+U79NT6i0KPzLImDfs8T7RlpyuMc4Ufs8ggyg9v3Ae6cN3eQyxcK3w0cbBwsh
        /nQNfsA6uu+9H7NhbehBMhYnpNZyrHzCmzyXkauwRAqoCbGCNykTRwsur9gS41TQ
        M8ssD1jFheOJf3hODnkKU+HKjvMROl1DK7zdmLdNzA1cvtZH/nCC9KPj1z8QC47S
        xx+dTZSx4ONAhwbS/LN3PoKtn8LPjY9NP9uDWI+TWYquS2U+KHDrBDlsgozDbs/O
        jCxcpDzNmXpWQHEtHU7649OXHP7UeNST1mCUCH5qdank0V1iejF6/CfTFU4MfcrG
        YT90qFF93M3v01BbxP+EIY2/9tiIPbrd
        =0YYh
        -----END PGP PUBLIC KEY BLOCK-----

packages:
  - qemu-guest-agent
  - docker-ce
  - docker-ce-cli
  - containerd.io
  - docker-buildx-plugin
  - docker-compose-plugin

write_files:
  - path: /root/install-runner.sh
    permissions: '0700'
    content: |
      #!/bin/bash

      set -eux

      cd /home/runner
      GITHUB_RUNNER_VERSION=$(curl --silent "https://api.github.com/repos/actions/runner/releases/latest" | jq -r '.tag_name[1:]')
      curl -Ls https://github.com/actions/runner/releases/download/v\${GITHUB_RUNNER_VERSION}/actions-runner-linux-x64-$GITHUB_RUNNER_VERSION.tar.gz | tar zx
      chown -R runner:runner .

  - path: /etc/systemd/system/gha-runner.service
    permissions: '0444'
    content: |
      [Unit]
      Description=GitHub Action runner
      After=network.target
      
      [Service]
      Type=simple
      User=runner
      KillMode=control-group
      KillSignal=SIGTERM
      TimeoutStopSec=5min
      Restart=never
      WorkingDirectory=~
      ExecStart=/home/runner/run.sh --jitconfig ${encoded_jit_config.data.encoded_jit_config}
      ExecStopPost=+/usr/sbin/poweroff
      
      [Install]
      WantedBy=multi-user.target

runcmd:
  - systemctl enable --now qemu-guest-agent
  - /root/install-runner.sh
  - systemctl daemon-reload
  - systemctl enable --now docker
  - systemctl enable --now gha-runner`;
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

      if (member.status === "running" && age >= 1000 * 60 * 20) {
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
      if (member.status === "stopped" && age >= 1000 * 30) {
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
        (smbios1["base64"] = 1),
          (smbios1["serial"] = btoa(
            `ds=nocloud;s=${config.PUBLIC_URL}/cloud-init/${token}/`,
          ));

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
}

await main();
