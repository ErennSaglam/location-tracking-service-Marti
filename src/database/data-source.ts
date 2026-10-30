import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './data-source-options.js';

// Entry point for the TypeORM CLI (migration:run / migration:revert).
// Loaded from dist/, so the CLI runs plain ESM without ts-node.
export default new DataSource(buildDataSourceOptions(process.env));
