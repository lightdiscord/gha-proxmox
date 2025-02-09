import axios from "axios";
import { Agent } from "node:https";
import { sleep } from "../utils.js";

export class Client {
  constructor(options) {
    this.axios = axios.create({
      baseURL: options.url,
      maxRedirects: 0,
      httpsAgent: new Agent({
        rejectUnauthorized: options.rejectUnauthorized || false,
      }),
    });

    this.axios.defaults.headers.common["Authorization"] =
      `PVEAPIToken=${options.token}`;
  }

  async listPoolMembers(poolid, type) {
    const { data: { data } } = await this.axios.get("/pools", { params: { poolid, type } });
    return data;
  }

  async taskStatus(node, upid) {
    const { data: { data } } = await this.axios.get(`/nodes/${node}/tasks/${upid}/status`);
    return data;
  }

  // TODO: Maybe some sort of timeout ?
  async waitTask(node, upid) {
    while (true) {
      const status = await this.taskStatus(node, upid)

      if (status.status === "stopped") {
        break
      }

      await sleep(1000)
    }
  }

  async qemuClone(node, vmid, newid, options) {
    const { data: { data } } = await this.axios.post(`/nodes/${node}/qemu/${vmid}/clone`, {
      name: options.name,
      pool: options.pool || undefined,
      full: options.full || false,
      newid,
    });

    return data;
  }

  async qemuConfig(node, vmid) {
    const { data: { data } } = await this.axios.get(`/nodes/${node}/qemu/${vmid}/config`);
    return data;
  }

  async qemuSetConfig(node, vmid, config={}) {
    const { data: { data } } = await this.axios.put(`/nodes/${node}/qemu/${vmid}/config`, config);
    return data;
  }

  async qemuSetStatus(node, vmid, status) {
    const { data: { data } } = await this.axios.post(`/nodes/${node}/qemu/${vmid}/status/${status}`);
    return data;
  }

  async qemuDelete(node, vmid, options={}) {
    const { data: { data } } = await this.axios.delete(`/nodes/${node}/qemu/${vmid}`, {
      params: {
        purge: options.purge || 1,
        "destroy-unreferenced-disks": options.destroyUnreferencedDisks || 1,
      },
    });
    return data;
  }
}
