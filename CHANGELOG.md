## [1.1.2](https://github.com/slmingol/pfsense-cli/compare/v1.1.1...v1.1.2) (2026-03-26)


### Documentation

* **makefile:** add advanced example showing HOST_BUB and HOST_LAMOLABS override usage ([012e47f](https://github.com/slmingol/pfsense-cli/commit/012e47f4c2e9386d9e91566c2ee7c59121644c41))

## [1.1.1](https://github.com/slmingol/pfsense-cli/compare/v1.1.0...v1.1.1) (2026-03-26)


### Documentation

* document HOST_BUB and HOST_LAMOLABS override args for add-service in README ([82d319e](https://github.com/slmingol/pfsense-cli/commit/82d319e0c5f4bfcc98ad00f41189fdcbd82cb1d1))

## [1.1.0](https://github.com/slmingol/pfsense-cli/compare/v1.0.4...v1.1.0) (2026-03-26)


### Features

* **makefile:** allow add-service to override backend/frontend hosts via HOST_BUB and HOST_LAMOLABS args ([ad8d632](https://github.com/slmingol/pfsense-cli/commit/ad8d63231fbf9269a086c7873dca9ca5e06877cb))

## [1.0.4](https://github.com/slmingol/pfsense-cli/compare/v1.0.3...v1.0.4) (2026-03-13)


### Documentation

* switch copilot instructions to podman command examples ([c0b480a](https://github.com/slmingol/pfsense-cli/commit/c0b480a19139603f03bbf2c54ab8e84d78006099))

## [1.0.3](https://github.com/slmingol/pfsense-cli/compare/v1.0.2...v1.0.3) (2026-03-13)


### Code Refactoring

* consolidate top-level directory structure ([fe2b313](https://github.com/slmingol/pfsense-cli/commit/fe2b313fcf56e976420086a43f356bc2e7769335))

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
