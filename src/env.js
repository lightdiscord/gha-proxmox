import { z } from "zod";

export const schema = z
  .object({
    HOST: z.string().default("::"),
    PORT: z.coerce
      .number()
      .nonnegative()
      .lt(2 ** 16),

    GITHUB_CLIENT_ID: z.string(),
    GITHUB_INSTALLATION_ID: z.coerce.number().nonnegative(),
    GITHUB_PRIVATE_KEY: z.string(),

    GITHUB_ORGANIZATION: z.string(),
    // TODO: Early validation to verify that the runner group already exists.
    GITHUB_RUNNER_GROUP_ID: z.coerce.number().nonnegative(),

    PUBLIC_URL: z.string(),
    JWT_SECRET: z.string(),

    PROXMOX_URL: z.string(),
    PROXMOX_TOKEN: z.string(),
    PROXMOX_INSECURE_TLS: z.coerce.boolean().default(false),
    // TODO: Early validation to verify that the node exists.
    PROXMOX_NODE: z.string(),
    // TODO: Early validation to verify that the pool exists.
    PROXMOX_POOL: z.string(),
    // TODO: Early validation to verify that the machine exists.
    PROXMOX_VMID: z.coerce.number().gte(100),
    PROXMOX_FULL_CLONE: z.coerce.boolean().default(false),
    PROXMOX_MIN_VMID: z.coerce.number().gte(100),
    PROXMOX_MAX_VMID: z.coerce.number().gte(100),

    LABELS: z.string().regex(/^[a-z0-9_-]+(,[a-z0-9_-]+)*$/i),
    MINIMUM_RUNNERS: z.coerce.number().nonnegative(),
  })
  .required()
  .refine((data) => data.PROXMOX_MIN_VMID <= data.PROXMOX_MAX_VMID);
