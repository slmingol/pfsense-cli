## [1.2.1](https://github.com/slmingol/pfsense-cli/compare/v1.2.0...v1.2.1) (2026-07-15)


### Documentation

* document config.mk site-local Makefile overrides in README ([36bd630](https://github.com/slmingol/pfsense-cli/commit/36bd6305b32da2f4f0fe1e4f24c0906c73136e92))

## [1.2.0](https://github.com/slmingol/pfsense-cli/compare/v1.1.3...v1.2.0) (2026-07-15)


### Features

* add bulk import for services, DNS, and HAProxy backends ([#4](https://github.com/slmingol/pfsense-cli/issues/4)) ([2322480](https://github.com/slmingol/pfsense-cli/commit/2322480cfcbfd55d3d185fec3b06a2edb766d7e7))
* add bulk:export and scheduled config history pruning ([#11](https://github.com/slmingol/pfsense-cli/issues/11), [#8](https://github.com/slmingol/pfsense-cli/issues/8)) ([7a51935](https://github.com/slmingol/pfsense-cli/commit/7a51935a2518d5af8bac80bc7ceba93e6fbe4ccb))
* add cert:check, DHCP static mappings, and wildcard cert renewal ([#9](https://github.com/slmingol/pfsense-cli/issues/9), [#12](https://github.com/slmingol/pfsense-cli/issues/12), [#13](https://github.com/slmingol/pfsense-cli/issues/13)) ([87649a8](https://github.com/slmingol/pfsense-cli/commit/87649a8d222c2157e1f369d42e5b16af31a6b44e))
* add certificate management and config history ([#5](https://github.com/slmingol/pfsense-cli/issues/5), [#6](https://github.com/slmingol/pfsense-cli/issues/6)) ([54bcbfa](https://github.com/slmingol/pfsense-cli/commit/54bcbfa77610a1722614d143cb30209378acd1b1))
* add delete-service target and clean up help alignment ([30581bc](https://github.com/slmingol/pfsense-cli/commit/30581bcc7925dbdfc478b27ebbe9c423180be3b7))
* add firewall alias management and alias-based VPN kill-switch ([cd0232d](https://github.com/slmingol/pfsense-cli/commit/cd0232d47ac04ed28ea79ab916eeb1ea1a07d642))
* add firewall rule management (fw-rule:list/add/delete/update) ([ad080f3](https://github.com/slmingol/pfsense-cli/commit/ad080f30dcb59a52879a3e3f311865a73292f998)), closes [#3](https://github.com/slmingol/pfsense-cli/issues/3)
* add NordVPN WireGuard support with server rotation and kill-switch ([fcbd851](https://github.com/slmingol/pfsense-cli/commit/fcbd8514a88708ba0535ab30e6fdfe55ceb3d214))
* add sectioned, colorized make help output ([e16bf9f](https://github.com/slmingol/pfsense-cli/commit/e16bf9f237caaec819a849dfc95183e155244d53))
* add SFP+ optics diagnostics (optics:show) ([#14](https://github.com/slmingol/pfsense-cli/issues/14)) ([2120f37](https://github.com/slmingol/pfsense-cli/commit/2120f3766711ca71f56d9057aa1148e9ec0895a9))
* add SSL=true backend support to add-service and haproxy-add ([a1bbdb9](https://github.com/slmingol/pfsense-cli/commit/a1bbdb96a4807fe8e9a5009882788a1e6c6c1862))
* add tag protection to artifact cleanup ([8e5aad8](https://github.com/slmingol/pfsense-cli/commit/8e5aad8d0f5d7d2f70c82be45abeafcdb77f0f92))
* add wg:provision command for zero-touch ProtonVPN WireGuard setup ([ce2db0e](https://github.com/slmingol/pfsense-cli/commit/ce2db0ef52985ffe87e1c0891f46f334bfd50f7f))
* auto-recover NordVPN WG when server is routing-dead ([#10](https://github.com/slmingol/pfsense-cli/issues/10) follow-up) ([704c514](https://github.com/slmingol/pfsense-cli/commit/704c5146ccd19bb5d8f9efdeecf783f4d3e6e996))
* automate NordVPN WireGuard server rotation ([#10](https://github.com/slmingol/pfsense-cli/issues/10)) ([692d523](https://github.com/slmingol/pfsense-cli/commit/692d52303f56cd58a2078d428f06630e4ced96df))
* colorize add-service/delete-service output and CLI messages ([2603dc1](https://github.com/slmingol/pfsense-cli/commit/2603dc1caa4072f1e4c0e1e3790a2b8aacabcda2))
* improve step area with [N/4] headers and indented sub-output ([e95a27f](https://github.com/slmingol/pfsense-cli/commit/e95a27f9d0c96d7fb7793d27bd990de9c83264ea))
* parameterize site-specific Makefile defaults + quiet docker build ([a6960c1](https://github.com/slmingol/pfsense-cli/commit/a6960c17b2d1506b0c6aa68d86ff3d2430da91bd))
* read NORDVPN_TOKEN from .env instead of requiring it on every command ([219137f](https://github.com/slmingol/pfsense-cli/commit/219137f37ffdf27363f5ea4d42fbf9d1667ecbff))
* reduce watchdog escalation window to 500s (~8 min) ([83fd94b](https://github.com/slmingol/pfsense-cli/commit/83fd94b96f4c5234fc45a29aacddb054fc27e9ed))


### Bug Fixes

* expose haproxy step errors suppressed by 2>/dev/null ([26309e2](https://github.com/slmingol/pfsense-cli/commit/26309e26de84742c6a84097e8b0cb265d524e1d2))
* force-rotate NordVPN WG when server is dead; directly update wg kernel ([2a763b7](https://github.com/slmingol/pfsense-cli/commit/2a763b7acf938ea77b3f898fb8fa44df144c72a0))
* prefix fw-rule Makefile vars with RULE_ to avoid WireGuard default collisions ([78785e1](https://github.com/slmingol/pfsense-cli/commit/78785e19fded7666e819269dbca5b034182f2b41))
* replace abandoned c-hive/gha-remove-artifacts with gh CLI ([f519859](https://github.com/slmingol/pfsense-cli/commit/f5198599eefa793b8da40f659ac50d3956e2e65b))
* resolve haproxy idempotency failure and improve host override docs ([daef8d8](https://github.com/slmingol/pfsense-cli/commit/daef8d8851e4c74435adef8647777fbbaf83d4e9))
* suppress docker-compose container lifecycle noise on haproxy steps ([cbef07b](https://github.com/slmingol/pfsense-cli/commit/cbef07be7e5869757a6c0823701b13c4a2f2e602))
* suppress NODE_TLS_REJECT_UNAUTHORIZED warning in Makefile ([3b92869](https://github.com/slmingol/pfsense-cli/commit/3b928695d7ebf39415c40b3cec9d8989b588ff1a))
* update axios from invalid version 1.14.2 to ^1.16.0 ([282b818](https://github.com/slmingol/pfsense-cli/commit/282b818e36696ff1b4e24139c1171ed2864f7caa))
* watchdog escalation never fires; Makefile TUNNEL collision ([b3e042e](https://github.com/slmingol/pfsense-cli/commit/b3e042e1f3fe053cc9ee91b5344816e206b7d0a6))
* watchdog must maintain monitor route through tun_wg1 ([7d1082d](https://github.com/slmingol/pfsense-cli/commit/7d1082dc6b03d5d788858c291a4f875a933eef87))
* watchdog removes escalation peer before GW monitor can register recovery ([0c4d1c8](https://github.com/slmingol/pfsense-cli/commit/0c4d1c8ac9d3e3c52bb31d8d0b67a257f7729680))


### Reverts

* remove Mac-side recovery cron (not wanted) ([75e67a5](https://github.com/slmingol/pfsense-cli/commit/75e67a56c90f73b62cae31912e753533cbcfac44))
* remove Mac-side scheduled rotation cron targets ([0988579](https://github.com/slmingol/pfsense-cli/commit/0988579423aa4f0cc669f183a144294fd21a8287))


### Documentation

* add Gluetun as alternative Docker-based VPN option ([f6804df](https://github.com/slmingol/pfsense-cli/commit/f6804dffb73b2eb0d66bc12e2544f3d0b7dbe363))
* add SFP+ optics diagnostics to README ([b372005](https://github.com/slmingol/pfsense-cli/commit/b3720053fc085ef4bec535c75f877e97c0a52077))
* update NordVPN WG section — monitor route fix, escalation, grace period ([8d2e183](https://github.com/slmingol/pfsense-cli/commit/8d2e1830d6d18d8cd7b7a5becf6d6edd4b5096d1))
* update NordVPN WG section — remove scheduled rotation, add FORCE and escalation ([0cbf320](https://github.com/slmingol/pfsense-cli/commit/0cbf32073ab2d4c87f3cbb16a9fa5ae62dcdbfc9))
* update README for delete-service and list-hosts ([baaf1fb](https://github.com/slmingol/pfsense-cli/commit/baaf1fb74f3b2c0376c50279cd916ca4cf7a9c30))
* update README for firewall alias management and KS_ALIAS ([31d735d](https://github.com/slmingol/pfsense-cli/commit/31d735d1a41e584668b354bf858ddaf9f9df982c))
* update README with colorized step output examples ([12deace](https://github.com/slmingol/pfsense-cli/commit/12deacef6c161eff4dcbe4ed650bf95ba202cd5b))

## [1.1.3](https://github.com/slmingol/pfsense-cli/compare/v1.1.2...v1.1.3) (2026-03-30)


### Bug Fixes

* move HOST variable assignments outside recipe to fix syntax error ([d4fc367](https://github.com/slmingol/pfsense-cli/commit/d4fc367d82278bd9f19167a243b90176d642b5d6))

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
