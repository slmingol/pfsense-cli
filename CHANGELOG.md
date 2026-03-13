## [1.0.2](https://github.com/slmingol/pfsense-cli/compare/v1.0.1...v1.0.2) (2026-03-13)


### Documentation

* add comprehensive Copilot agent onboarding instructions ([2a18d39](https://github.com/slmingol/pfsense-cli/commit/2a18d395e7bc2f47b988f29a0e9ead45dca4dc5f))

## [1.0.1](https://github.com/slmingol/pfsense-cli/compare/v1.0.0...v1.0.1) (2026-03-13)


### Documentation

* fix semantic-release badge preset and add version badge ([0e47eff](https://github.com/slmingol/pfsense-cli/commit/0e47effcd900d150df8159124b56dd72ba38b7ca))

## 1.0.0 (2026-03-13)


### Features

* add ASCII logo for pfSense CLI ([7e91f06](https://github.com/slmingol/pfsense-cli/commit/7e91f063b2f16954d0060b927d4da70531d3e8af))
* initial release of pfSense CLI tool ([0039724](https://github.com/slmingol/pfsense-cli/commit/00397248156e88eee083c407c7bb63c2b6bd2fc0))


### Bug Fixes

* **ci:** create dummy .env file for Docker build in CI ([9fc4d6e](https://github.com/slmingol/pfsense-cli/commit/9fc4d6e75ec176630246bb598e9f83fdf79c2701))
* **ci:** fix workflow YAML syntax error in release workflow ([126deba](https://github.com/slmingol/pfsense-cli/commit/126debacc2ffa95dd2f54e51d6d446714ab9aa15))
* **ci:** remove npm audit signatures and NPM_TOKEN from release workflow ([eddfafd](https://github.com/slmingol/pfsense-cli/commit/eddfafd2a943063314d17932391bf80e9c9c237e))
* **ci:** update docker-compose to docker compose command ([8b088ca](https://github.com/slmingol/pfsense-cli/commit/8b088cab8ab1e26d4b22ab08571a2eb2d1424602))


### Documentation

* replace specific domains with generic examples in README ([7ebadc3](https://github.com/slmingol/pfsense-cli/commit/7ebadc39fbe633fd919f61c40cc05d50df619fe0))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release
- DNS Resolver management (list, add, update, delete)
- DNS alias management (add, delete)
- HAProxy backend management (list, add, delete)
- HAProxy frontend routing (ACL + Action management)
- Complete service deployment workflow
- Docker-based CLI tool
- Idempotent operations
- Comprehensive documentation
