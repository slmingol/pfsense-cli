.PHONY: build run dns-list dns-add dns-update dns-delete dns-alias-add dns-alias-delete add-dual-alias haproxy-list haproxy-add haproxy-delete add-service delete-service list-hosts help cli-help test-api check-version

.DEFAULT_GOAL := help

HOST_BUB      ?= docker-host-01-svcs
HOST_LAMOLABS ?= lamolabs-svcs
SSL           ?= false

help: ## Show this help message
	@printf "\n\033[1;37mpfSense CLI\033[0m — DNS & HAProxy management\n\n"
	@awk 'BEGIN {FS = ":.*?## "} \
	  /^##@/ { printf "\n\033[1;33m%s\033[0m\n", substr($$0, 5) } \
	  /^[a-zA-Z_-]+:.*?## / { printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2 }' \
	  $(MAKEFILE_LIST)
	@printf "\n"
	@printf "\033[1mExamples:\033[0m\n"
	@printf "  \033[32mmake add-service\033[0m    ALIAS=myapp PORT=8080 DESC='My Application'\n"
	@printf "  \033[32mmake delete-service\033[0m ALIAS=myapp\n"
	@printf "\n"
	@printf "  \033[90m# HOST_BUB / HOST_LAMOLABS: hostname (no domain) of an existing DNS entry\033[0m\n"
	@printf "  \033[90m# in the respective domain. Run 'make list-hosts' to see valid values.\033[0m\n"
	@printf "  \033[32mmake add-service\033[0m    ALIAS=myapp PORT=8080 DESC='My App' HOST_BUB=docker-host-02-svcs HOST_LAMOLABS=lamolabs-svcs\n"
	@printf "  \033[32mmake add-service\033[0m    ALIAS=myapp PORT=8080 DESC='My App' HOST_BUB=orangepi5-svcs     HOST_LAMOLABS=lamolabs-svcs\n"
	@printf "  \033[32mmake add-service\033[0m    ALIAS=myapp PORT=443  DESC='My App' HOST_BUB=docker-host-02-svcs SSL=true \033[90m# backend serves HTTPS\033[0m\n"
	@printf "  \033[32mmake delete-service\033[0m ALIAS=myapp HOST_BUB=docker-host-02-svcs HOST_LAMOLABS=lamolabs-svcs\n"
	@printf "\n"
	@printf "  \033[32mmake list-hosts\033[0m    \033[90m# show available HOST_BUB / HOST_LAMOLABS values\033[0m\n"
	@printf "  \033[32mmake dns-list\033[0m      \033[90m# list all DNS entries\033[0m\n"
	@printf "  \033[32mmake haproxy-list\033[0m  \033[90m# list all HAProxy backends\033[0m\n"
	@printf "\n"
	@printf "For CLI help: \033[36mmake cli-help\033[0m\n\n"

##@ Service Management

# Usage: make add-service ALIAS=myapp PORT=5431 DESC="My App - https://github.com/..."
add-service: ## Add complete service (ALIAS= PORT= DESC= [SSL=true]) - DNS + HAProxy
	@if [ -z "$(ALIAS)" ] || [ -z "$(PORT)" ] || [ -z "$(DESC)" ]; then \
		echo "Error: ALIAS, PORT, and DESC are required"; \
		echo "Usage: make add-service ALIAS=service-name PORT=8080 DESC='Service description' [HOST_BUB=backend-host] [HOST_LAMOLABS=frontend-host] [SSL=true]"; \
		exit 1; \
	fi
	@printf "\n\033[1;36m[1/4]\033[0m DNS alias \033[36m$(ALIAS).bub.lan\033[0m → \033[36m$(HOST_BUB).bub.lan\033[0m \033[90m(backend)\033[0m\n"
	@docker-compose run --rm pfsense-cli alias:add --host $(HOST_BUB) --domain bub.lan --alias-host $(ALIAS) --alias-domain bub.lan --description "$(DESC)" 2>/dev/null || true
	@printf "\n\033[1;36m[2/4]\033[0m DNS alias \033[36m$(ALIAS).lamolabs.org\033[0m → \033[36m$(HOST_LAMOLABS).lamolabs.org\033[0m \033[90m(frontend)\033[0m\n"
	@docker-compose run --rm pfsense-cli alias:add --host $(HOST_LAMOLABS) --domain lamolabs.org --alias-host $(ALIAS) --alias-domain lamolabs.org --description "$(DESC)" 2>/dev/null || true
	@printf "\n\033[1;36m[3/4]\033[0m HAProxy backend \033[36m$(ALIAS)\033[0m → \033[36m$(ALIAS).bub.lan:$(PORT)\033[0m$(if $(filter true,$(SSL)), \033[33m[SSL]\033[0m)\n"
	@docker-compose run --rm pfsense-cli haproxy:add --name $(ALIAS) --server-name $(ALIAS).bub.lan --server-address $(ALIAS).bub.lan --server-port $(PORT) $(if $(filter true,$(SSL)),--ssl) 2>/dev/null
	@printf "\n\033[1;36m[4/4]\033[0m Frontend route \033[36m$(ALIAS).lamolabs.org\033[0m → \033[36m$(ALIAS)\033[0m backend\n"
	@docker-compose run --rm pfsense-cli haproxy:route-add --frontend HomePrivateServers --acl $(ALIAS) --hostname $(ALIAS).lamolabs.org --backend $(ALIAS) 2>/dev/null
	@printf "\n\033[1;32m✓ Service \033[1;37m$(ALIAS)\033[1;32m fully configured!\033[0m\n"
	@printf "\n  \033[1mDNS:\033[0m\n"
	@printf "    \033[90m-\033[0m \033[36m$(ALIAS).bub.lan\033[0m \033[90m→ $(HOST_BUB).bub.lan (backend)\033[0m\n"
	@printf "    \033[90m-\033[0m \033[36m$(ALIAS).lamolabs.org\033[0m \033[90m→ $(HOST_LAMOLABS).lamolabs.org (HAProxy frontend)\033[0m\n"
	@printf "\n  \033[1mHAProxy:\033[0m\n"
	@printf "    \033[90m-\033[0m Backend: \033[36m$(ALIAS)\033[0m \033[90m→\033[0m \033[36m$(ALIAS).bub.lan:$(PORT)\033[0m\n"
	@printf "    \033[90m-\033[0m Frontend \033[33mHomePrivateServers\033[0m: \033[36m$(ALIAS).lamolabs.org\033[0m \033[90m→\033[0m \033[36m$(ALIAS)\033[0m backend\n"
	@printf "\n  \033[1mAccess via:\033[0m \033[1;32mhttps://$(ALIAS).lamolabs.org\033[0m\n\n"

# Usage: make delete-service ALIAS=myapp [HOST_BUB=docker-host-01-svcs] [HOST_LAMOLABS=lamolabs-svcs]
delete-service: ## Remove complete service (ALIAS=) - DNS + HAProxy (reverse of add-service)
	@if [ -z "$(ALIAS)" ]; then \
		echo "Error: ALIAS is required"; \
		echo "Usage: make delete-service ALIAS=service-name [HOST_BUB=backend-host] [HOST_LAMOLABS=frontend-host]"; \
		exit 1; \
	fi
	@printf "\n\033[1;36m[1/4]\033[0m Frontend route \033[36m$(ALIAS).lamolabs.org\033[0m\n"
	@docker-compose run --rm pfsense-cli haproxy:route-delete --frontend HomePrivateServers --acl $(ALIAS) 2>/dev/null || true
	@printf "\n\033[1;36m[2/4]\033[0m HAProxy backend \033[36m$(ALIAS)\033[0m\n"
	@docker-compose run --rm pfsense-cli haproxy:delete --name $(ALIAS) 2>/dev/null || true
	@printf "\n\033[1;36m[3/4]\033[0m DNS alias \033[36m$(ALIAS).lamolabs.org\033[0m → \033[36m$(HOST_LAMOLABS).lamolabs.org\033[0m \033[90m(frontend)\033[0m\n"
	@docker-compose run --rm pfsense-cli alias:delete --host $(HOST_LAMOLABS) --domain lamolabs.org --alias-host $(ALIAS) --alias-domain lamolabs.org 2>/dev/null || true
	@printf "\n\033[1;36m[4/4]\033[0m DNS alias \033[36m$(ALIAS).bub.lan\033[0m → \033[36m$(HOST_BUB).bub.lan\033[0m \033[90m(backend)\033[0m\n"
	@docker-compose run --rm pfsense-cli alias:delete --host $(HOST_BUB) --domain bub.lan --alias-host $(ALIAS) --alias-domain bub.lan 2>/dev/null || true
	@printf "\n\033[1;32m✓ Service \033[1;37m$(ALIAS)\033[1;32m removed!\033[0m\n"
	@printf "\n  \033[1mDeleted:\033[0m\n"
	@printf "    \033[90m-\033[0m Frontend ACL+Action: \033[36m$(ALIAS).lamolabs.org\033[0m\n"
	@printf "    \033[90m-\033[0m HAProxy backend: \033[36m$(ALIAS)\033[0m\n"
	@printf "    \033[90m-\033[0m DNS alias: \033[36m$(ALIAS).lamolabs.org\033[0m\n"
	@printf "    \033[90m-\033[0m DNS alias: \033[36m$(ALIAS).bub.lan\033[0m\n\n"

list-hosts: ## Show valid HOST_BUB and HOST_LAMOLABS values (queries live DNS)
	@echo "Querying pfSense DNS for registered hosts..."
	@echo ""
	@echo "Backend hosts  (HOST_BUB candidates — bub.lan domain):"
	@result=$$(docker-compose run --rm pfsense-cli list 2>/dev/null \
	  | grep -E '^\s*[0-9]+\.' | grep '\.bub\.lan' \
	  | sed 's/.*[0-9]\+\. //; s/\.bub\.lan//'); \
	if [ -z "$$result" ]; then echo "  (none found)"; else echo "$$result" | sed 's/^/  /'; fi
	@echo ""
	@echo "Frontend hosts (HOST_LAMOLABS candidates — lamolabs.org domain):"
	@result=$$(docker-compose run --rm pfsense-cli list 2>/dev/null \
	  | grep -E '^\s*[0-9]+\.' | grep '\.lamolabs\.org' \
	  | sed 's/.*[0-9]\+\. //; s/\.lamolabs\.org//'); \
	if [ -z "$$result" ]; then echo "  (none found)"; else echo "$$result" | sed 's/^/  /'; fi
	@echo ""
	@echo "Usage:"
	@echo "  make add-service ALIAS=myapp PORT=8080 DESC='My App' HOST_BUB=<value-above> HOST_LAMOLABS=<value-above>"

##@ DNS

dns-list: ## List all DNS entries
	@docker-compose run --rm pfsense-cli list 2>/dev/null

dns-add: ## Add DNS entry (HOST= DOMAIN= IP= [DESC=])
	@if [ -z "$(HOST)" ] || [ -z "$(DOMAIN)" ] || [ -z "$(IP)" ]; then \
		echo "Error: HOST, DOMAIN, and IP are required"; \
		echo "Usage: make dns-add HOST=myserver DOMAIN=local.lan IP=192.168.1.100 [DESC='Description']"; \
		exit 1; \
	fi
	@docker-compose run --rm pfsense-cli add --host $(HOST) --domain $(DOMAIN) --ip $(IP) $(if $(DESC),--description "$(DESC)") 2>/dev/null

dns-update: ## Update DNS entry (HOST= DOMAIN= [IP=] [DESC=])
	@if [ -z "$(HOST)" ] || [ -z "$(DOMAIN)" ]; then \
		echo "Error: HOST and DOMAIN are required"; \
		echo "Usage: make dns-update HOST=myserver DOMAIN=local.lan [IP=192.168.1.101] [DESC='Description']"; \
		exit 1; \
	fi
	@docker-compose run --rm pfsense-cli update --host $(HOST) --domain $(DOMAIN) $(if $(IP),--ip $(IP)) $(if $(DESC),--description "$(DESC)") 2>/dev/null

dns-delete: ## Delete DNS entry (HOST= DOMAIN=)
	@if [ -z "$(HOST)" ] || [ -z "$(DOMAIN)" ]; then \
		echo "Error: HOST and DOMAIN are required"; \
		echo "Usage: make dns-delete HOST=myserver DOMAIN=local.lan"; \
		exit 1; \
	fi
	@docker-compose run --rm pfsense-cli delete --host $(HOST) --domain $(DOMAIN) 2>/dev/null

dns-alias-add: ## Add DNS alias (HOST= DOMAIN= ALIAS= ALIAS_DOMAIN= [DESC=])
	@if [ -z "$(HOST)" ] || [ -z "$(DOMAIN)" ] || [ -z "$(ALIAS)" ] || [ -z "$(ALIAS_DOMAIN)" ]; then \
		echo "Error: HOST, DOMAIN, ALIAS, and ALIAS_DOMAIN are required"; \
		echo "Usage: make dns-alias-add HOST=myserver DOMAIN=local.lan ALIAS=www ALIAS_DOMAIN=local.lan [DESC='Description']"; \
		exit 1; \
	fi
	@docker-compose run --rm pfsense-cli alias:add --host $(HOST) --domain $(DOMAIN) --alias-host $(ALIAS) --alias-domain $(ALIAS_DOMAIN) $(if $(DESC),--description "$(DESC)") 2>/dev/null

dns-alias-delete: ## Delete DNS alias (HOST= DOMAIN= ALIAS= ALIAS_DOMAIN=)
	@if [ -z "$(HOST)" ] || [ -z "$(DOMAIN)" ] || [ -z "$(ALIAS)" ] || [ -z "$(ALIAS_DOMAIN)" ]; then \
		echo "Error: HOST, DOMAIN, ALIAS, and ALIAS_DOMAIN are required"; \
		echo "Usage: make dns-alias-delete HOST=myserver DOMAIN=local.lan ALIAS=www ALIAS_DOMAIN=local.lan"; \
		exit 1; \
	fi
	@docker-compose run --rm pfsense-cli alias:delete --host $(HOST) --domain $(DOMAIN) --alias-host $(ALIAS) --alias-domain $(ALIAS_DOMAIN) 2>/dev/null

# Usage: make add-dual-alias ALIAS=myapp DESC="My App - https://github.com/..."
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

##@ HAProxy

haproxy-list: ## List all HAProxy backends
	@docker-compose run --rm pfsense-cli haproxy:list 2>/dev/null

haproxy-add: ## Add HAProxy backend (NAME= SERVER= PORT=)
	@if [ -z "$(NAME)" ] || [ -z "$(SERVER)" ] || [ -z "$(PORT)" ]; then \
		echo "Error: NAME, SERVER, and PORT are required"; \
		echo "Usage: make haproxy-add NAME=backend-name SERVER=server.domain.com PORT=8080"; \
		exit 1; \
	fi
	@docker-compose run --rm pfsense-cli haproxy:add --name $(NAME) --server-name $(SERVER) --server-address $(SERVER) --server-port $(PORT) $(if $(filter true,$(SSL)),--ssl) 2>/dev/null

haproxy-delete: ## Delete HAProxy backend (NAME=)
	@if [ -z "$(NAME)" ]; then \
		echo "Error: NAME is required"; \
		echo "Usage: make haproxy-delete NAME=backend-name"; \
		exit 1; \
	fi
	@docker-compose run --rm pfsense-cli haproxy:delete --name $(NAME) 2>/dev/null

##@ Infrastructure

build: ## Build the Docker image
	docker-compose build

test-api: ## Test pfSense API connectivity
	@echo "Testing pfSense API connection..."
	@docker-compose run --rm --entrypoint sh pfsense-cli -c 'echo "Host: $$PFSENSE_HOST" && echo "Testing API endpoint: $$PFSENSE_HOST/api/v2/system/api" && echo "" && apk add --quiet curl > /dev/null 2>&1 && RESPONSE=$$(curl -s -k -w "\n%{http_code}" -H "Authorization: $$PFSENSE_API_KEY $$PFSENSE_API_SECRET" $$PFSENSE_HOST/api/v2/system/api) && HTTP_CODE=$$(echo "$$RESPONSE" | tail -n1) && BODY=$$(echo "$$RESPONSE" | head -n-1) && echo "$$BODY" | head -20 && echo "" && if [ "$$HTTP_CODE" = "200" ]; then echo "✓ API is accessible!"; else echo "✗ API returned HTTP $$HTTP_CODE"; echo ""; echo "The pfSense RESTAPI package is not installed."; echo "See INSTALL_API.md for installation instructions."; echo ""; echo "Quick install: SSH to pfSense and run:"; echo "  pkg install -y https://github.com/pfrest/pfSense-pkg-RESTAPI/releases/download/v2.7.2/pfSense-2.7.2-pkg-RESTAPI.pkg"; exit 1; fi'

check-version: ## Check pfSense version and API status
	@echo "Checking pfSense version and available endpoints..."
	@docker-compose run --rm --entrypoint sh pfsense-cli -c 'apk add --quiet curl > /dev/null 2>&1 && echo "Testing various API endpoints:" && echo "" && echo "1. Built-in API (pfSense 2.5+):" && curl -s -k -w " [HTTP %{http_code}]\n" -H "Authorization: $$PFSENSE_API_KEY $$PFSENSE_API_SECRET" $$PFSENSE_HOST/api/v2/system/version -o /dev/null && echo "" && echo "2. Community API package:" && curl -s -k -w " [HTTP %{http_code}]\n" -H "Authorization: $$PFSENSE_API_KEY $$PFSENSE_API_SECRET" $$PFSENSE_HOST/api/v2/system/api -o /dev/null && echo "" && echo "If both show 404, you need to install the API package."'

cli-help: ## Show CLI command help (--help output)
	docker-compose run --rm pfsense-cli --help

clean: ## Clean up Docker resources
	docker-compose down -v
