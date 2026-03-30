.PHONY: build run dns-list dns-add dns-update dns-delete dns-alias-add dns-alias-delete add-dual-alias haproxy-list haproxy-add haproxy-delete add-service help cli-help test-api check-version

.DEFAULT_GOAL := help

# Show available make targets
help: ## Show this help message
	@echo "pfSense CLI - Available Make Targets"
	@echo "======================================"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "Examples:"
	@echo "  # Basic usage - uses default hosts (docker-host-01-svcs, lamolabs-svcs)"
	@echo "  make add-service ALIAS=myapp PORT=8080 DESC='My Application'"
	@echo ""
	@echo "  # Advanced - override backend/frontend hosts:"
	@echo "  make add-service ALIAS=myapp PORT=8080 DESC='My Application' HOST_BUB=custom-backend HOST_LAMOLABS=custom-frontend"
	@echo ""
	@echo "  make dns-list"
	@echo "  make haproxy-list"
	@echo ""
	@echo "For CLI command help: make cli-help"

# Build the Docker image
build: ## Build the Docker image
	docker-compose build

# Show CLI help
cli-help: ## Show CLI command help (--help output)
	docker-compose run --rm pfsense-cli --help

# Test API connectivity
test-api: ## Test pfSense API connectivity
	@echo "Testing pfSense API connection..."
	@docker-compose run --rm --entrypoint sh pfsense-cli -c 'echo "Host: $$PFSENSE_HOST" && echo "Testing API endpoint: $$PFSENSE_HOST/api/v2/system/api" && echo "" && apk add --quiet curl > /dev/null 2>&1 && RESPONSE=$$(curl -s -k -w "\n%{http_code}" -H "Authorization: $$PFSENSE_API_KEY $$PFSENSE_API_SECRET" $$PFSENSE_HOST/api/v2/system/api) && HTTP_CODE=$$(echo "$$RESPONSE" | tail -n1) && BODY=$$(echo "$$RESPONSE" | head -n-1) && echo "$$BODY" | head -20 && echo "" && if [ "$$HTTP_CODE" = "200" ]; then echo "✓ API is accessible!"; else echo "✗ API returned HTTP $$HTTP_CODE"; echo ""; echo "The pfSense RESTAPI package is not installed."; echo "See INSTALL_API.md for installation instructions."; echo ""; echo "Quick install: SSH to pfSense and run:"; echo "  pkg install -y https://github.com/pfrest/pfSense-pkg-RESTAPI/releases/download/v2.7.2/pfSense-2.7.2-pkg-RESTAPI.pkg"; exit 1; fi'

# Check pfSense version
check-version: ## Check pfSense version and API status
	@echo "Checking pfSense version and available endpoints..."
	@docker-compose run --rm --entrypoint sh pfsense-cli -c 'apk add --quiet curl > /dev/null 2>&1 && echo "Testing various API endpoints:" && echo "" && echo "1. Built-in API (pfSense 2.5+):" && curl -s -k -w " [HTTP %{http_code}]\n" -H "Authorization: $$PFSENSE_API_KEY $$PFSENSE_API_SECRET" $$PFSENSE_HOST/api/v2/system/version -o /dev/null && echo "" && echo "2. Community API package:" && curl -s -k -w " [HTTP %{http_code}]\n" -H "Authorization: $$PFSENSE_API_KEY $$PFSENSE_API_SECRET" $$PFSENSE_HOST/api/v2/system/api -o /dev/null && echo "" && echo "If both show 404, you need to install the API package."'

# List DNS entries
dns-list: ## List all DNS entries
	@docker-compose run --rm pfsense-cli list 2>/dev/null

# Add a DNS entry (usage: make dns-add HOST=myserver DOMAIN=local.lan IP=192.168.1.100)
dns-add: ## Add DNS entry (HOST= DOMAIN= IP= [DESC=])
	@if [ -z "$(HOST)" ] || [ -z "$(DOMAIN)" ] || [ -z "$(IP)" ]; then \
		echo "Error: HOST, DOMAIN, and IP are required"; \
		echo "Usage: make dns-add HOST=myserver DOMAIN=local.lan IP=192.168.1.100 [DESC='Description']"; \
		exit 1; \
	fi
	@docker-compose run --rm pfsense-cli add --host $(HOST) --domain $(DOMAIN) --ip $(IP) $(if $(DESC),--description "$(DESC)") 2>/dev/null

# Update a DNS entry (usage: make dns-update HOST=myserver DOMAIN=local.lan IP=192.168.1.101)
dns-update: ## Update DNS entry (HOST= DOMAIN= [IP=] [DESC=])
	@if [ -z "$(HOST)" ] || [ -z "$(DOMAIN)" ]; then \
		echo "Error: HOST and DOMAIN are required"; \
		echo "Usage: make dns-update HOST=myserver DOMAIN=local.lan [IP=192.168.1.101] [DESC='Description']"; \
		exit 1; \
	fi
	@docker-compose run --rm pfsense-cli update --host $(HOST) --domain $(DOMAIN) $(if $(IP),--ip $(IP)) $(if $(DESC),--description "$(DESC)") 2>/dev/null

# Delete a DNS entry (usage: make dns-delete HOST=myserver DOMAIN=local.lan)
dns-delete: ## Delete DNS entry (HOST= DOMAIN=)
	@if [ -z "$(HOST)" ] || [ -z "$(DOMAIN)" ]; then \
		echo "Error: HOST and DOMAIN are required"; \
		echo "Usage: make dns-delete HOST=myserver DOMAIN=local.lan"; \
		exit 1; \
	fi
	@docker-compose run --rm pfsense-cli delete --host $(HOST) --domain $(DOMAIN) 2>/dev/null

# Add an alias (usage: make dns-alias-add HOST=myserver DOMAIN=local.lan ALIAS=www ALIAS_DOMAIN=local.lan)
dns-alias-add: ## Add DNS alias (HOST= DOMAIN= ALIAS= ALIAS_DOMAIN= [DESC=])
	@if [ -z "$(HOST)" ] || [ -z "$(DOMAIN)" ] || [ -z "$(ALIAS)" ] || [ -z "$(ALIAS_DOMAIN)" ]; then \
		echo "Error: HOST, DOMAIN, ALIAS, and ALIAS_DOMAIN are required"; \
		echo "Usage: make dns-alias-add HOST=myserver DOMAIN=local.lan ALIAS=www ALIAS_DOMAIN=local.lan [DESC='Description']"; \
		exit 1; \
	fi
	@docker-compose run --rm pfsense-cli alias:add --host $(HOST) --domain $(DOMAIN) --alias-host $(ALIAS) --alias-domain $(ALIAS_DOMAIN) $(if $(DESC),--description "$(DESC)") 2>/dev/null

# Delete an alias (usage: make dns-alias-delete HOST=myserver DOMAIN=local.lan ALIAS=www ALIAS_DOMAIN=local.lan)
dns-alias-delete: ## Delete DNS alias (HOST= DOMAIN= ALIAS= ALIAS_DOMAIN=)
	@if [ -z "$(HOST)" ] || [ -z "$(DOMAIN)" ] || [ -z "$(ALIAS)" ] || [ -z "$(ALIAS_DOMAIN)" ]; then \
		echo "Error: HOST, DOMAIN, ALIAS, and ALIAS_DOMAIN are required"; \
		echo "Usage: make dns-alias-delete HOST=myserver DOMAIN=local.lan ALIAS=www ALIAS_DOMAIN=local.lan"; \
		exit 1; \
	fi
	@docker-compose run --rm pfsense-cli alias:delete --host $(HOST) --domain $(DOMAIN) --alias-host $(ALIAS) --alias-domain $(ALIAS_DOMAIN) 2>/dev/null

# Add alias to both docker-host-01-svcs.bub.lan and lamolabs-svcs.lamolabs.org
# Usage: make add-dual-alias ALIAS=jitterbox-rocks DESC="Jitterbox Rocks - https://github.com/slmingol/jitterbox-rocks"
add-dual-alias: ## Add alias to both bub.lan and lamolabs.org (ALIAS= DESC=)
	@if [ -z "$(ALIAS)" ] || [ -z "$(DESC)" ]; then \
		echo "Error: ALIAS and DESC are required"; \
		echo "Usage: make add-dual-alias ALIAS=service-name DESC='Service description'"; \
		exit 1; \
	fi
	@echo "Adding $(ALIAS) alias to docker-host-01-svcs.bub.lan..."
	@docker-compose run --rm pfsense-dns-cli alias:add --host docker-host-01-svcs --domain bub.lan --alias-host $(ALIAS) --alias-domain bub.lan --description "$(DESC)" 2>/dev/null
	@echo "Adding $(ALIAS) alias to lamolabs-svcs.lamolabs.org..."
	@docker-compose run --rm pfsense-dns-cli alias:add --host lamolabs-svcs --domain lamolabs.org --alias-host $(ALIAS) --alias-domain lamolabs.org --description "$(DESC)" 2>/dev/null

# HAProxy backend management

# List HAProxy backends
haproxy-list: ## List all HAProxy backends
	@docker-compose run --rm pfsense-cli haproxy:list 2>/dev/null

# Add HAProxy backend (usage: make haproxy-add NAME=backend-name SERVER=server.domain.com PORT=8080)
haproxy-add: ## Add HAProxy backend (NAME= SERVER= PORT=)
	@if [ -z "$(NAME)" ] || [ -z "$(SERVER)" ] || [ -z "$(PORT)" ]; then \
		echo "Error: NAME, SERVER, and PORT are required"; \
		echo "Usage: make haproxy-add NAME=backend-name SERVER=server.domain.com PORT=8080"; \
		exit 1; \
	fi
	@docker-compose run --rm pfsense-cli haproxy:add --name $(NAME) --server-name $(SERVER) --server-address $(SERVER) --server-port $(PORT) 2>/dev/null

# Delete HAProxy backend (usage: make haproxy-delete NAME=backend-name)
haproxy-delete: ## Delete HAProxy backend (NAME=)
	@if [ -z "$(NAME)" ]; then \
		echo "Error: NAME is required"; \
		echo "Usage: make haproxy-delete NAME=backend-name"; \
		exit 1; \
	fi
	@docker-compose run --rm pfsense-cli haproxy:delete --name $(NAME) 2>/dev/null

# Add complete service (DNS aliases + HAProxy backend + frontend routes)
# Usage: make add-service ALIAS=jitterbox-rocks PORT=5431 DESC="Jitterbox Rocks - https://github.com/slmingol/jitterbox-rocks"
# Allow override of backend/frontend hosts, default to current values
HOST_BUB ?= docker-host-01-svcs
HOST_LAMOLABS ?= lamolabs-svcs

add-service: ## Add complete service (ALIAS= PORT= DESC=) - DNS + HAProxy
	@if [ -z "$(ALIAS)" ] || [ -z "$(PORT)" ] || [ -z "$(DESC)" ]; then \
		echo "Error: ALIAS, PORT, and DESC are required"; \
		echo "Usage: make add-service ALIAS=service-name PORT=8080 DESC='Service description' [HOST_BUB=backend-host] [HOST_LAMOLABS=frontend-host]"; \
		exit 1; \
	fi
	@echo "Step 1/4: Adding DNS alias $(ALIAS).bub.lan → $(HOST_BUB).bub.lan (for backend)..."
	@docker-compose run --rm pfsense-cli alias:add --host $(HOST_BUB) --domain bub.lan --alias-host $(ALIAS) --alias-domain bub.lan --description "$(DESC)" 2>/dev/null || true
	@echo "Step 2/4: Adding DNS alias $(ALIAS).lamolabs.org → $(HOST_LAMOLABS).lamolabs.org (for frontend)..."
	@docker-compose run --rm pfsense-cli alias:add --host $(HOST_LAMOLABS) --domain lamolabs.org --alias-host $(ALIAS) --alias-domain lamolabs.org --description "$(DESC)" 2>/dev/null || true
	@echo "Step 3/4: Creating HAProxy backend $(ALIAS) → $(ALIAS).bub.lan:$(PORT)..."
	@docker-compose run --rm pfsense-cli haproxy:add --name $(ALIAS) --server-name $(ALIAS).bub.lan --server-address $(ALIAS).bub.lan --server-port $(PORT) 2>/dev/null
	@echo "Step 4/4: Adding frontend ACL+Action: $(ALIAS).lamolabs.org → $(ALIAS) backend..."
	@docker-compose run --rm pfsense-cli haproxy:route-add --frontend HomePrivateServers --acl $(ALIAS) --hostname $(ALIAS).lamolabs.org --backend $(ALIAS) 2>/dev/null
	@echo ""
	@echo "✓ Service $(ALIAS) fully configured!"
	@echo "  DNS:"
	@echo "    - $(ALIAS).bub.lan → 192.168.7.42 (backend server resolution)"
	@echo "    - $(ALIAS).lamolabs.org → 192.168.7.1 (HAProxy frontend)"
	@echo "  HAProxy:"
	@echo "    - Backend: $(ALIAS) → $(ALIAS).bub.lan:$(PORT)"
	@echo "    - Frontend HomePrivateServers: $(ALIAS).lamolabs.org → $(ALIAS) backend"
	@echo ""
	@echo "  Access via: https://$(ALIAS).lamolabs.org"

# Clean up Docker resources
clean: ## Clean up Docker resources
	docker-compose down -v

# Show all targets
.DEFAULT_GOAL := help
