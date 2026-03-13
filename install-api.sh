#!/bin/sh
# pfSense API Package Installation Helper
# Run this on your pfSense box to install the API package

echo "=========================================="
echo "pfSense API Package Installer"
echo "=========================================="
echo ""

# Check pfSense version
PFSENSE_VERSION=$(cat /etc/version)
echo "Detected pfSense version: $PFSENSE_VERSION"
echo ""

# Determine major version for package selection
MAJOR_VERSION=$(echo $PFSENSE_VERSION | cut -d. -f1-2)
echo "Using package for version: $MAJOR_VERSION"
echo ""

# Test internet connectivity
echo "Testing connectivity to GitHub..."
if ! ping -c 2 github.com > /dev/null 2>&1; then
    echo "ERROR: Cannot reach github.com"
    echo "Please check your internet connection and firewall rules"
    exit 1
fi
echo "✓ GitHub is reachable"
echo ""

# Bootstrap pkg if needed
echo "Checking pkg..."
if ! which pkg > /dev/null 2>&1; then
    echo "Bootstrapping pkg..."
    /usr/sbin/pkg bootstrap -f
fi
echo "✓ pkg is available"
echo ""

# List of versions to try (from newest to oldest)
VERSIONS="v2.7.3 v2.7.2 v2.7.1 v2.7.0"
PKG_FILE="pfSense-${MAJOR_VERSION}-pkg-RESTAPI.pkg"

echo "Attempting to download and install RESTAPI package..."
echo ""

for VERSION in $VERSIONS; do
    URL="https://github.com/pfrest/pfSense-pkg-RESTAPI/releases/download/${VERSION}/${PKG_FILE}"
    
    echo "Trying version $VERSION..."
    echo "URL: $URL"
    
    # Try to download
    if fetch -o /tmp/${PKG_FILE} "$URL" 2>/dev/null; then
        echo "✓ Downloaded successfully!"
        echo ""
        echo "Installing package..."
        
        if pkg install -y /tmp/${PKG_FILE}; then
            echo ""
            echo "✓ Package installed successfully!"
            echo ""
            echo "Restarting web server..."
            /etc/rc.restart_webgui
            echo ""
            echo "=========================================="
            echo "Installation complete!"
            echo "=========================================="
            echo ""
            echo "Next steps:"
            echo "1. Go to System > API in pfSense web interface"
            echo "2. Enable the API"
            echo "3. Create API credentials"
            echo "4. Test with: make test-api"
            echo ""
            exit 0
        else
            echo "✗ Installation failed"
            rm -f /tmp/${PKG_FILE}
        fi
    else
        echo "✗ Download failed"
    fi
    echo ""
done

echo "=========================================="
echo "Automatic installation failed"
echo "=========================================="
echo ""
echo "Please try manual installation:"
echo "1. Visit: https://github.com/pfrest/pfSense-pkg-RESTAPI/releases"
echo "2. Download the package for pfSense $MAJOR_VERSION"
echo "3. Upload to pfSense and install with:"
echo "   pkg install -y /path/to/package.pkg"
echo ""
exit 1
