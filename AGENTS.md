# AGENTS.md

## Overview
OpenCLI plugin for grid trading analysis (网格交易分析工具). Integrates with `@jackwener/opencli` as a plugin.

## Key Files
- `constants.js` - All constants (table names, API paths, headers, limits, etc.)
- `utils.js` - Cookie/config management, date helpers, masking, error classes
- `db.js` - DuckDB connection manager (singleton), `withDb` helper, `SQL` object, process signal cleanup
- `business.js` - Core business logic: initDb, initAccount, syncTrade, tradeMatch, gridProfit
- `quotes-api.js` - Quotes business logic: API calls, account/position/quote fetching, aggregation
- `quotes.js` - CLI entrypoint for `opencli stock quotes`
- `init.js` - CLI entrypoint for `opencli stock init` (browser-based cookie acquisition)
- `sync.js` - CLI entrypoint for `opencli stock sync`
- `match.js` - CLI entrypoint for `opencli stock match`
- `profit.js` - CLI entrypoint for `opencli stock profit`
- `sql-schema.js` - CREATE TABLE SQL definitions
- `sql-sync.js` - Account & trade sync SQL (DuckDB http_request)
- `sql-match.js` - Trade matching SQL (buy/sell pairing)
- `sql-profit.js` - Grid profit query SQL
- `data/config` - Must contain valid cookie for sync to work
- `data/stock.db` - DuckDB database file

## Architecture
- CLI entrypoints (`init.js`, `sync.js`, `match.js`, `profit.js`, `quotes.js`) are thin wrappers calling business logic
- Business logic lives in `business.js` and `quotes-api.js`
- SQL templates in `sql-*.js` use constants from `constants.js` (TABLE, OP, DICT_TYPE, etc.)
- DuckDB with `http_request` extension for API calls directly from SQL

## Dependencies
- ES module project (`"type": "module"`)
- Peer dependency: `@jackwener/opencli >=1.0.0`
- Native dependency: `duckdb` (requires binary compilation)

## Setup
Before running sync, write a valid cookie to `data/config` (format: `userid=XXXXX;...`).
Or run `opencli stock init` to acquire cookie via browser.

## No CI/Lint/Tests
No scripts defined in package.json. This is a simple plugin without test or build infrastructure.