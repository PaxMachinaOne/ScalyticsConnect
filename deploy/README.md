# Connect Deployment System

This directory contains scripts to deploy and manage the Connect application. It provides two distinct workflows: a recommended **Production** deployment from a release artifact and a **Development** deployment from a Git repository.

## Directory Structure

-   `/production`: Scripts for deploying a stable, versioned release to a production server.
-   `/dev`: Scripts for deploying the latest code from a Git branch for development or testing.
-   `/modules`: Shared helper scripts used by both workflows.
-   `/templates`: Shared template files (e.g., for maintenance pages).

---

## Production Deployment (Recommended)

This workflow is the standard, recommended method for deploying to a production server. It involves provisioning a cloud VM, preparing the server environment, and then deploying the application.

### Prerequisites: Cloud VM Provisioning (GCP Example)

Before running our scripts, you need a provisioned server. Here is an example of how to create a suitable VM on Google Cloud Platform.

**1. Create the GCP Instance:**
Use the `gcloud` CLI to create a new VM instance with NVIDIA L4 GPUs.

```bash
gcloud compute instances create "sc-connect-prod" \
  --zone "europe-west2-a" \
  --machine-type "g2-standard-96" \
  --metadata="install-nvidia-driver=True" \
  --maintenance-policy "TERMINATE" \
  --accelerator type=nvidia-l4,count=8 \
  --image "ubuntu-2204-jammy-v20230919" \
  --image-project "ubuntu-os-cloud" \
  --boot-disk-size "128GB" \
  --boot-disk-type "pd-ssd"
```

**2. (Optional) Format and Mount a Persistent Disk:**
If you have attached a separate disk for data, connect to the VM and mount it.

```bash
# Connect to the VM
gcloud compute ssh sc-connect-prod --zone=europe-west2-a

# Format the disk (confirm the device name with 'sudo fdisk -l')
sudo mkfs.ext4 -F /dev/sdb

# Create mount point and mount the disk
sudo mkdir -p /var/www/connect
sudo mount /dev/sdb /var/www/connect

# Configure automatic mounting on boot
UUID=$(sudo blkid -s UUID -o value /dev/sdb)
echo "UUID=$UUID /var/www/connect ext4 defaults,nofail 0 2" | sudo tee -a /etc/fstab
```

### Step 1: Server Provisioning

On a new, clean server, run the bootstrap script. This script will prepare the entire environment.

**Tasks performed:**
-   Installs all required system packages (`apt`).
-   Adds the Node.js 20.x repository.
-   Configures the system compiler to GCC 12.
-   Creates the `sconnect` application user and adds it to the `sudo` and `www-data` groups.
-   Creates the `/var/www/connect` application directory with correct permissions.
-   Performs a check for GPU hardware and necessary drivers, halting if they are not found.
-   Hardens SSH and configures the firewall.

**Usage:**
```bash
# Run as root on a new server
sudo ./production/bootstrap.sh
```

### Step 2: Application Deployment

After bootstrapping the server, switch to the `sconnect` user, upload and unzip your release package, and run the deployment script.

**Tasks performed:**
-   Copies application files from the release package to `/var/www/connect`.
-   Installs all `npm` and `pip` dependencies.
-   Runs the application build process.
-   Initializes the database.
-   Configures and starts the application using `pm2`.
-   Sets up Caddy as a reverse proxy with SSL.

**Usage:**
```bash
# As root, after running bootstrap.sh
sudo su - sconnect

# Unzip your release package
unzip Connect-Release-v1.2.3.zip
cd Connect-Release-v1.2.3

# Run the deployment script
sudo ./deploy/production/release-deploy.sh -u https://your-domain.com
```

---

## Development Deployment

This workflow is for development or staging environments where you need to deploy the latest code directly from a Git repository.

### `dev/deploy.sh`
Performs a full, initial deployment from a Git repository branch.

**Usage:**
```bash
# Deploys the 'main' branch
sudo ./dev/deploy.sh -u https://dev.your-domain.com
```

### `dev/update.sh`
Updates an existing development deployment by pulling the latest changes from the Git repository.

**Usage:**
```bash
# Updates to the latest commit on the 'main' branch
sudo ./dev/update.sh -u https://dev.your-domain.com

# Updates to a specific branch
sudo ./dev/update.sh -u https://dev.your-domain.com --branch=feature-branch
```

---

## GCP Deployment

For deploying on Google Cloud Platform (GCP), the **Production Deployment** workflow is the recommended method.

1.  **Provision a VM:** Create a new Compute Engine instance (e.g., Ubuntu 22.04).
2.  **Bootstrap the Server:** SSH into the new instance and run the `bootstrap.sh` script as described in the "Production Deployment" section.
3.  **Deploy the Application:** Upload your release package, unzip it, and run the `release-deploy.sh` script.

This ensures a stable, reproducible, and secure deployment in the cloud.
