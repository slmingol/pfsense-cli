# Installing the pfSense API Package

For pfSense 2.7.2, the API package needs to be manually installed since it's not in the default package repository.

## Quick Start: Automated Installation Script

**Easiest method - use our helper script:**

1. **Copy the script to pfSense**:
   ```bash
   # Replace with your pfSense hostname/IP
   scp install-api.sh admin@pfsense-rtr1.lamolabs.org:/tmp/
   ```

2. **SSH into pfSense and run it**:
   ```bash
   ssh admin@pfsense-rtr1.lamolabs.org
   # Then:
   sh /tmp/install-api.sh
   ```

The script will:
- Auto-detect your pfSense version
- Try multiple package versions automatically
- Install the package
- Restart the web server
- Show you next steps

**If the automated script fails**, it likely means the GitHub releases aren't compatible. Continue with manual methods below.

---

## Manual Installation

If the automated script doesn't work, try these manual methods:

### Check What's Available First

Before trying to install, let's see what package versions exist:

```bash
# SSH into pfSense first, then:

# Check your pfSense version
cat /etc/version

# Check if a specific package file exists (test with curl/fetch)
# This will return 302 (redirect) if the file exists, 404 if not
fetch --no-verify-peer -o /dev/null https://github.com/pfrest/pfSense-pkg-RESTAPI/releases/download/v2.7.2/pfSense-2.7.2-pkg-RESTAPI.pkg 2>&1 | grep -E "(302|404|200)"

# Or use the GitHub API to see all releases
fetch -qo - https://api.github.com/repos/pfrest/pfSense-pkg-RESTAPI/releases | grep -o '"tag_name": "[^"]*"'

# Or browse the releases page and grep for package names
fetch --no-verify-peer -o /tmp/releases.html https://github.com/pfrest/pfSense-pkg-RESTAPI/releases
grep -o 'pfSense-2\.7[^"]*\.pkg' /tmp/releases.html | sort -u
```

This will show you exactly which package files are available for pfSense 2.7.

---

## Method 1: SSH Installation (Recommended)

1. **SSH into your pfSense**:
   ```bash
   ssh admin@pfsense-rtr1.lamolabs.org -p 10443
   ```
   Or use your standard SSH port if different.

2. **Drop to shell** (select option 8 if prompted for menu)

3. **First, check available releases**:
   
   The package URL may vary by version. Try these in order:
   
   **Option A - For pfSense 2.7.2 (your version):**
   ```bash
   pkg install -y https://github.com/pfrest/pfSense-pkg-RESTAPI/releases/download/v2.7.2/pfSense-2.7.2-pkg-RESTAPI.pkg
   ```
   
   **Option B - For pfSense 2.7.3:**
   ```bash
   pkg install -y https://github.com/pfrest/pfSense-pkg-RESTAPI/releases/download/v2.7.3/pfSense-2.8.0-pkg-RESTAPI.pkg
   ```
   
   **Option C - Download first, then install:**
   ```bash
   # Download the package for your version
   fetch https://github.com/pfrest/pfSense-pkg-RESTAPI/releases/download/v2.7.2/pfSense-2.7.2-pkg-RESTAPI.pkg
   
   # Install from local file
   pkg install -y pfSense-2.7.2-pkg-RESTAPI.pkg
   ```
   
   **Option D - FreeBSD pkg bootstrap (if pkg command fails):**
   ```bash
   # Bootstrap pkg first
   /usr/sbin/pkg bootstrap -f
   
   # Then try installation again
   pkg install -y https://github.com/jaredhendrickson13/pfsense-api/releases/download/v2.7.0/pfSense-2.7-pkg-API.pkg
   ```

4. **Restart the web server**:
   ```bash
   /etc/rc.restart_webgui
   ```

5. **Test from your machine**:
   ```bash
   cd /Users/smingolelli/dev/projects/pfsense-dns-cli
   make test-api
   ```

## Method 2: Web GUI Installation

1. **Log into pfSense web interface**

2. **Go to Diagnostics > Command Prompt**

3. **In the "Execute Shell Command" box, paste**:
   ```bash
   pkg add https://github.com/jaredhendrickson13/pfsense-api/releases/latest/download/pfSense-2.7-pkg-API.pkg
   ```

4. **Click Execute**

5. **Restart web server** (run this command too):
   ```bash
   /etc/rc.restart_webgui
   ```

6. **Configure the API**:
   - Go to **System > API**
   - Check **Enable API**
   - Set to **Read/Write** mode
   - Configure allowed IP ranges (or leave as "any" for testing)
   - Click **Save**

## Method 3: Using Our Helper Script

If you have SSH access, you can use this one-liner from your Mac:

```bash
ssh admin@pfsense-rtr1.lamolabs.org -p 10443 "pkg add https://github.com/jaredhendrickson13/pfsense-api/releases/latest/download/pfSense-2.7-pkg-API.pkg && /etc/rc.restart_webgui"
```

## After Installation

1. **Configure API credentials in pfSense**:
   - Go to System > API
   - Enable the API
   - Create API credentials (if not already done)

2. **Test the connection**:
   ```bash
   cd /Users/smingolelli/dev/projects/pfsense-dns-cli
   make test-api
   ```

   You should see:
   ```
   ✓ API is accessible!
   ```

3. **Try listing DNS entries**:
   ```bash
   make list
   ```

## Troubleshooting

### "pkg: An error occurred while fetching package"

This usually means the URL doesn't exist or GitHub is unreachable. Try these steps:

1. **Check internet connectivity from pfSense**:
   ```bash
   ping -c 3 github.com
   ```
   
2. **Check what releases are available**:
   ```bash
   # Use fetch to see if the file exists
   fetch --no-verify-peer -o /tmp/test.html https://github.com/jaredhendrickson13/pfsense-api/releases
   grep "pfSense-2.7" /tmp/test.html
   ```

3. **Try a specific known version** instead of "latest":
   ```bash
   # Example with v2.7.0
   pkg install -y https://github.com/jaredhendrickson13/pfsense-api/releases/download/v2.7.0/pfSense-2.7-pkg-API.pkg
   ```

4. **Download manually and inspect**:
   ```bash
   # Download to temp directory
   cd /tmp
   fetch --no-verify-peer https://github.com/jaredhendrickson13/pfsense-api/releases/download/v2.7.0/pfSense-2.7-pkg-API.pkg
   
   # Check if file was downloaded
   ls -lh pfSense-2.7-pkg-API.pkg
   
   # Install local file
   pkg install -y pfSense-2.7-pkg-API.pkg
   ```

5. **Check available package versions online**:
   - Visit: https://github.com/jaredhendrickson13/pfsense-api/releases
   - Find the package file for pfSense 2.7
   - Note the exact version number (e.g., v2.7.0, v2.7.1)
   - Use that specific version in the URL

6. **Alternative: Use curl if fetch fails**:
   ```bash
   # Install curl if not available
   pkg install -y curl
   
   # Download with curl
   curl -L -o pfSense-2.7-pkg-API.pkg https://github.com/jaredhendrickson13/pfsense-api/releases/download/v2.7.0/pfSense-2.7-pkg-API.pkg
   
   # Install
   pkg install -y pfSense-2.7-pkg-API.pkg
   ```

### "pkg: No packages available to install matching 'pfSense-2.7-pkg-API.pkg'"

The GitHub release might be unavailable. Try these alternatives:

1. **Check available releases**:
   Visit: https://github.com/jaredhendrickson13/pfsense-api/releases

2. **Download and install manually**:
   ```bash
   # On pfSense:
   fetch https://github.com/jaredhendrickson13/pfsense-api/releases/download/v2.7.0/pfSense-2.7-pkg-API.pkg
   pkg add pfSense-2.7-pkg-API.pkg
   ```

### "Package installation failed"

Check if you have internet access from pfSense:
```bash
ping -c 3 github.com
```

### "API still returns 404"

1. Verify the package is installed:
   ```bash
   pkg info | grep API
   ```

2. Restart the web server:
   ```bash
   /etc/rc.restart_webgui
   ```

3. Check the API is enabled at System > API

## Alternative: Using pfSense Config Direct Edit

If the API package installation fails entirely, we could modify this tool to:
- Use SSH to directly edit `/cf/conf/config.xml`
- Use pfSense's built-in XML-RPC (if enabled)
- Use FauxAPI (different third-party API)

Let me know if you need help with alternatives!
