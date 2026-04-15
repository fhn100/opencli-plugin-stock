import { cli, Strategy } from '@jackwener/opencli/registry';
import { DuckDBInstance } from '@duckdb/node-api';

cli({
    site: 'grid',
    name: 'query',
    description: 'Query data files (CSV, Parquet, JSON) using DuckDB SQL',
    domain: 'localhost',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        { name: 'sql', type: 'str', required: true, positional: true, help: 'SQL query (e.g. SELECT * FROM \'data.parquet\')' },
        { name: 'file', type: 'str', alias: 'f', help: 'Data file to query (CSV, Parquet, JSON)' },
        { name: 'table', type: 'str', help: 'Table name for the file (default: filename without extension)' },
    ],
    columns: ['*'],
    func: async (_, kwargs) => {
        const instance = await DuckDBInstance.create(':memory:');
        const conn = await instance.connect();

        if (kwargs.file) {
            const tableName = kwargs.table || kwargs.file.split('/').pop()?.replace(/\.[^.]+$/, '') || 'data';
            await conn.run(`CREATE TABLE "${tableName}" AS SELECT * FROM '${kwargs.file}'`);
        }

        const result = await conn.runAndReadAll(kwargs.sql);
        const rows = result.getRowObjects();
        await conn.close();
        return rows;
    },
});
