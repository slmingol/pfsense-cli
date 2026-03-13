# pfSense API Setup Guide

This guide will help you enable and configure the pfSense API for use with this CLI tool.

## Prerequisites

**IMPORTANT**: This tool requires the **pfSense RESTAPI package** from pfrest. This is NOT the built-in pfSense API.

For **pfSense 2.7.2** (and most versions), you must manually install the RESTAPI package first.

👉 **See [INSTALL_API.md](INSTALL_API.md) for detailed installation instructions**

Quick install via SSH:
```bash
ssh admin@your-pfsense-ip
# Then run:
pkg install -y https://github.com/pfrest/pfSense-pkg-RESTAPI/releases/download/v2.7.2/pfSense-2.7.2-pkg-RESTAPI.pkg
/etc/rc.restart_webgui
```

## Step 1: Enable the API in pfSense

**After installing the RESTAPI package**, configure it:

1. Log in to your pfSense web interface
2. Navigate to **System > API**
3. Check the box to **Enable API**
4. Configure the following settings:
   - **Access Mode**: Set to "Both Read/Write + Read-Only"
   - **Allow API access from**: Configure to allow from your network/IP
   - **Enable Allow only Access Tokens**: Recommended for security

5. Click **Save**

## Step 2: Create API Credentials

1. Still on the **System > API** page, scroll down to **API Keys**
2. Click **Add** to create a new API key
3. Fill in the details:
   - **Username**: Select the user for API access (typically admin)
   - **Description**: e.g., "DNS CLI Tool"
   - **Privilege**: Ensure the user has DNS Resolver privileges

4. Click **Save**
5. **IMPORTANT**: Copy both the **Client-Id** (API Key) and **Client-Secret** (API Secret)
   - You won't be able to see the secret again!

## Step 3: Configure the CLI Tool

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit the `.env` file and add your credentials:
   ```env
   PFSENSE_HOST=https://192.168.1.1
   PFSENSE_API_KEY=your_client_id_here
   PFSENSE_API_SECRET=your_client_secret_here
   ```

3. If using self-signed certificates, uncomment:
   ```env
   NODE_TLS_REJECT_UNAUTHORIZED=0
   ```

## Step 4: Test the Connection

Build and test the connection:

```bash
# Build the Docker container
make build

# List DNS entries (this will test the connection)
make list
```

If successful, you should see your existing DNS host override entries listed.

## Troubleshooting

### "Connection refused" or "ECONNREFUSED"
- Verify pfSense is accessible from your Docker container
- Check pfSense firewall rules allow API access
- Ensure you're using the correct IP address

### "401 Unauthorized"
- Double-check your API key and secret in `.env`
- Verify the API user has proper privileges
- Ensure API is enabled in System > API

### "SSL certificate problem"
- Add `NODE_TLS_REJECT_UNAUTHORIZED=0` to your `.env` file
- Better option: Add pfSense's certificate to your trust store

### "404 Not Found" on API endpoint
- Verify your pfSense version supports the API
- API was introduced in pfSense 2.5.0
- Check that you're using the correct API endpoints

## Required Privileges

The API user needs the following privileges in pfSense:

- WebCfg - Services: DNS Resolver page
- WebCfg - System: API

To set these:
1. Go to **System > User Manager**
2. Click on the user
3. Check the required privileges in the **Effective Privileges** section
4. Add missing privileges if needed

## API Endpoints Used

This tool uses the following pfSense API endpoints:

- `GET /api/v1/services/unbound/host_override` - List DNS entries
- `POST /api/v1/services/unbound/host_override` - Add DNS entry
- `PUT /api/v1/services/unbound/host_override` - Update DNS entry
- `DELETE /api/v1/services/unbound/host_override` - Delete DNS entry
- `POST /api/v1/services/unbound/apply` - Apply configuration changes

## References

- [pfSense API Documentation](https://docs.netgate.com/pfsense/en/latest/api/index.html)
- [pfSense API Package](https://github.com/jaredhendrickson13/pfsense-api)
