#!/bin/sh
# pfSense RESTAPI Package Installer
# Run on pfSense (SSH or console). Checks USB cache first, falls back to GitHub.
#
# USB cache location: /mnt/usb_backup/pkgs/
# Pre-populate with: make backup-usb-cache-pkgs (from pfsense-cli on management host)

USB_MOUNT="${USB_MOUNT:-/mnt/usb_backup}"

echo "=========================================="
echo "pfSense RESTAPI Package Installer"
echo "=========================================="
echo ""

PFSENSE_VERSION=$(cat /etc/version | cut -d- -f1)
PKG_FILE="pfSense-${PFSENSE_VERSION}-pkg-RESTAPI.pkg"

echo "pfSense version : $PFSENSE_VERSION"
echo "Package file    : $PKG_FILE"
echo ""

# Bootstrap pkg if needed
if ! which pkg > /dev/null 2>&1; then
    echo "Bootstrapping pkg..."
    /usr/sbin/pkg bootstrap -f
fi

# ---------------------------------------------------------------------------
# Step 1: check USB cache
# ---------------------------------------------------------------------------

LOCAL_PKG="${USB_MOUNT}/pkgs/${PKG_FILE}"

if [ -f "${LOCAL_PKG}" ]; then
    echo "Found cached package: ${LOCAL_PKG}"
    echo "Installing from USB cache (no internet required)..."
    echo ""
    if pkg install -y "${LOCAL_PKG}"; then
        echo ""
        echo "✓ Installed from USB cache."
        /etc/rc.restart_webgui
        echo ""
        echo "Next steps:"
        echo "  1. System > API — enable API"
        echo "  2. Create API credentials"
        echo "  3. make test-api (from pfsense-cli on management host)"
        echo ""
        exit 0
    else
        echo "✗ Install from cache failed — trying GitHub..."
        echo ""
    fi
else
    echo "No USB cache found at ${LOCAL_PKG}"
    echo "Trying GitHub..."
    echo ""
fi

# ---------------------------------------------------------------------------
# Step 2: fetch from GitHub
# ---------------------------------------------------------------------------

if ! ping -c 2 github.com > /dev/null 2>&1; then
    echo "=========================================="
    echo "ERROR: No USB cache and cannot reach GitHub"
    echo "=========================================="
    echo ""
    echo "Recovery options:"
    echo "  A) Restore internet (WAN) and re-run this script"
    echo "  B) Pre-populate USB cache from management host:"
    echo "       make backup-usb-cache-pkgs"
    echo "     then re-run this script"
    echo ""
    exit 1
fi

# Discover latest release tag from GitHub API
LATEST_TAG=$(fetch -qo - 'https://api.github.com/repos/pfrest/pfSense-pkg-RESTAPI/releases?per_page=3' 2>/dev/null \
    | grep -o '"tag_name":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$LATEST_TAG" ]; then
    VERSIONS="$LATEST_TAG v2.10.0 v2.9.0 v2.8.4"
else
    VERSIONS="v2.10.0 v2.9.0 v2.8.4 v2.8.3"
fi
echo "Release tags to try: $VERSIONS"
echo ""

for VERSION in $VERSIONS; do
    URL="https://github.com/pfrest/pfSense-pkg-RESTAPI/releases/download/${VERSION}/${PKG_FILE}"
    echo "Trying $VERSION..."
    if fetch -o /tmp/${PKG_FILE} "$URL" 2>/dev/null && [ -s /tmp/${PKG_FILE} ]; then
        echo "✓ Downloaded."
        if pkg install -y /tmp/${PKG_FILE}; then
            echo ""
            echo "✓ Installed from GitHub."
            /etc/rc.restart_webgui
            echo ""
            echo "Tip: cache this for offline use:"
            echo "  make backup-usb-cache-pkgs (from pfsense-cli on management host)"
            echo ""
            exit 0
        else
            echo "✗ Install failed"
            rm -f /tmp/${PKG_FILE}
        fi
    else
        echo "✗ Download failed"
    fi
    echo ""
done

echo "=========================================="
echo "Installation failed — all versions tried"
echo "=========================================="
echo ""
echo "Manual fallback:"
echo "  1. Visit https://github.com/pfrest/pfSense-pkg-RESTAPI/releases"
echo "  2. Download pfSense-${MAJOR_VERSION}-pkg-RESTAPI.pkg"
echo "  3. pkg install -y /path/to/package.pkg"
echo ""
exit 1
