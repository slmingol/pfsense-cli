#!/bin/bash
#
# pfSense CLI - Shell Alias Setup
#
# This script adds a convenient shell alias for the pfSense CLI tool.
#
# INSTALLATION:
# Add this line to your ~/.bashrc or ~/.zshrc:
#
#   source /Users/smingolelli/dev/projects/pfsense-cli/setup-alias.sh
#
# Or run it once to test:
#
#   source /Users/smingolelli/dev/projects/pfsense-cli/setup-alias.sh
#
# USAGE EXAMPLES:
#
# Get help (list all available commands):
#   pfsense help                                                      # Show all make targets
#   pfsense cli-help                                                  # Show CLI --help output
#   pfsense logo                                                      # Display ASCII logo
#
# Complete Service Deployment (DNS + HAProxy):
#   pfsense add-service ALIAS=myapp PORT=3000 DESC="My Application"
#   pfsense add-service ALIAS=jitterbox-rocks PORT=5431 DESC="Jitterbox Rocks - https://github.com/slmingol/jitterbox-rocks"
#
# DNS Management:
#   pfsense dns-list                                                  # List all DNS entries
#   pfsense dns-add HOST=server DOMAIN=bub.lan IP=192.168.7.50 DESC="My server"
#   pfsense dns-update HOST=server DOMAIN=bub.lan IP=192.168.7.51
#   pfsense dns-delete HOST=server DOMAIN=bub.lan
#
# DNS Aliases:
#   pfsense dns-alias-add HOST=server DOMAIN=bub.lan ALIAS=web ALIAS_DOMAIN=bub.lan DESC="Web alias"
#   pfsense dns-alias-delete HOST=server DOMAIN=bub.lan ALIAS=web ALIAS_DOMAIN=bub.lan
#   pfsense add-dual-alias ALIAS=myservice DESC="My Service"         # Add to both .bub.lan and .lamolabs.org
#
# HAProxy Management:
#   pfsense haproxy-list                                              # List all HAProxy backends
#   pfsense haproxy-add NAME=myapp SERVER=myapp.bub.lan PORT=8080
#   pfsense haproxy-delete NAME=myapp
#
# Other Commands:
#   pfsense build                                                     # Rebuild Docker image
#   pfsense test-api                                                  # Test API connectivity
#   pfsense clean                                                     # Clean up Docker resources
#
# For a full list of available commands with descriptions, run:
#   pfsense help
#
# TRAFFIC FLOW:
#   User → https://myapp.lamolabs.org
#     ↓ DNS resolves to 192.168.7.1 (HAProxy frontend)
#     ↓ HAProxy HomePrivateServers frontend matches ACL
#     ↓ Routes to myapp backend
#     ↓ Backend connects to myapp.bub.lan:3000
#     ↓ DNS resolves to 192.168.7.42:3000 (actual service)
#

# Create the alias
alias pfsense='make -C /Users/smingolelli/dev/projects/pfsense-cli'

# Confirm alias is set
if [ -n "$BASH_VERSION" ] || [ -n "$ZSH_VERSION" ]; then
    echo "✓ pfSense CLI alias configured. Type 'pfsense' to use it."
    echo "  Run 'pfsense help' to see all available commands"
fi
