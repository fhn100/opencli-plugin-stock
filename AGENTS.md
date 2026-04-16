# AGENTS.md

## Overview
OpenCLI plugin for grid trading analysis (网格交易分析工具). Integrates with `@jackwener/opencli` as a plugin.

## Key Files
- `utils.js` - Database utilities (DuckDB), table schemas, sync functions
- `sync.js` - CLI command entrypoint registering via `@jackwener/opencli/registry`
- `data/config` - Must contain valid cookie for sync to work
- `data/grid.db` - DuckDB database file

## Dependencies
- ES module project (`"type": "module"`)
- Peer dependency: `@jackwener/opencli >=1.0.0`
- Native dependency: `duckdb` (requires binary compilation)

## Setup
Before running sync, write a valid cookie to `data/config` (format: `userid=XXXXX;...`).

## No CI/Lint/Tests
No scripts defined in package.json. This is a simple plugin without test or build infrastructure.