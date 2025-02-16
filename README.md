# gha-proxmox

Controller for GitHub Actions self-hosted runners on Proxmox. The service will automatically clone
an existing virtual machine and provide a Cloud-Init configuration to the machine. The configuration
will tell the virtual machine to install the required dependencies and register as a GitHub Action
runner.

## Requirements

- The controller uses the `ctime` property of the virtual machine to detect when they need to be
  removed. Currently, Proxmox does not update this field when a virtual machine is cloned. A patch
  of the `qemu-server` is required until a change is added.

  - https://bugzilla.proxmox.com/show_bug.cgi?id=6156
  - https://bugzilla.proxmox.com/attachment.cgi?id=1467

- A Proxmox API token is required. The following permissions need to be attached :
  - `/vms/${PROXMOX_POOL}` role `PVEPoolUser`.
  - `/vms/${PROXMOX_POOL}` role `PVEVMAdmin`.
  - `/vms/${PROXMOX_VMID}` role `PVETemplateUser`.
    - Permissions based on the storage and network used by the template.
    - `/storage/:storages` role `PVEDatastoreUser`.
    - `/sdn/zones/:zone` role `PVESDNUser` (propagate).

## Configuration

| Variable                  | Description                                              | Default |
|---------------------------|----------------------------------------------------------|---------|
| `HOST`                    | Address used for the HTTP server                         | `::`    |
| `PORT`                    | Port used for the HTTP server                            | `80`    |
| `GITHUB_CLIENT_ID`        | Client ID of the GitHub application                      | None    |
| `GITHUB_INSTALLATION_ID`  | Installation ID of the GitHub application                | None    |
| `GITHUB_PRIVATE_KEY_FILE` | Path to the application private key                      | None    |
| `GITHUB_ORGANIZATION`     | Organization where the application is installed          | None    |
| `GITHUB_RUNNER_GROUP_ID`  | Group used to configure the runner                       | None    |
| `PUBLIC_URL`              | URL of the controller's HTTP server                      | None    |
| `JWT_SECRET`              | Secret used by the application                           | None    |
| `PROXMOX_URL`             | URL of the Proxmox Virtual Environment                   | None    |
| `PROXMOX_TOKEN`           | Token used to authenticate                               | None    |
| `PROXMOX_INSECURE_TLS`    | Disable TLS verification                                 | `false` |
| `PROXMOX_NODE`            | Node used                                                | None    |
| `PROXMOX_POOL`            | Pool in which runners are created                        | None    |
| `PROXMOX_VMID`            | Virtual machine to clone                                 | None    |
| `PROXMOX_FULL_CLONE`      | Create a full copy of all disks                          | `false` |
| `PROXMOX_MIN_VMID`        | Minimum VMID to use for the pool of runners              | None    |
| `PROXMOX_MAX_VMID`        | Maximum VMID to use for the pool of runners              | None    |
| `LABELS`                  | Comma separated list of labels to apply to the runner    | None    |
| `MINIMUM_RUNNERS`         | Minimum number of runner the controller will keep active | None    |
| `MAXIMUM_AGE`             | Maximum age before deleting a virtual machine in minutes | 2 days  |
| `USER_DATA_FILE`          | Path to the user-data template                           | None    |

The Proxmox token variable is in the `user@realm!name=value` format.

## TODOs

- [ ] Currently, only runners on a GitHub organization are supported, some modifications can be done
      to enable the controller to work on repositories.
- [ ] Instead of just ignoring invalid TLS certificates we could allow only specific certificate
      digests.
- [ ] Make the GitHub base URL variable to allow the usage of the controller on self-hosted GitHub
      instances.
- [ ] Enable HTTPS configuration.
