## 2026-10-06 (local E2E: build once, run many spec files)

### Added

- **Many local spec files share one E2E build** (#205). `scripts/e2e-server.sh` builds and
  starts the E2E server in the background, with the same chain, env, database and HTTPS proxy
  as a fresh run, and `E2E_REUSE=1 playwright test <file>` runs spec files against it without
  building again. It refuses to test stale code: once the app source differs from the build's,
  committed or not, it asks for a rebuild, while an edit under `tests/` alone never does.
  `--status` and `--stop` report on and stop the server. CI and the default mode still build
  fresh on every run.
