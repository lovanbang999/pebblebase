export type DatabaseType = 'postgres' | 'mysql' | 'mongodb' | 'sqlite';
export type EnvironmentType = 'local' | 'development' | 'staging' | 'production';

export interface Connection {
  id: string;
  name: string;
  type: DatabaseType;
  host: string;
  port: string;
  user: string;
  db_name: string;
  filepath?: string;
  read_only?: boolean;
  environment?: EnvironmentType;
  save_password: boolean;
  created_at: string;
}

export interface ConnectionInput {
  name: string;
  type: DatabaseType;
  mode: 'form' | 'url';
  host?: string;
  port?: string;
  user?: string;
  password?: string;
  db_name?: string;
  filepath?: string;
  read_only?: boolean;
  environment?: EnvironmentType;
  raw_url?: string;
  save_password: boolean;
}

export interface ColumnSchema {
  name: string;
  type: string; // 'string' | 'int' | 'float' | 'bool' | 'datetime' | 'json' | 'binary' | 'uuid' | 'unknown'
  nullable: boolean;
  is_primary_key: boolean;
  is_foreign_key: boolean;
  default_value?: string;
}

export interface RelationSchema {
  name: string;
  type: 'one_to_one' | 'one_to_many' | 'many_to_many';
  from_table: string;
  from_column: string;
  to_table: string;
  to_column: string;
}

export interface TableSchema {
  name: string;
  columns: ColumnSchema[];
  relations: RelationSchema[];
}

export interface FilterOption {
  column: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains';
  value: string;
}

export interface RowQueryParams {
  limit?: number;
  offset?: number;
  sort_by?: string;
  sort_desc?: boolean;
  filters?: FilterOption[];
}

export interface QueryResult {
  rows: Record<string, any>[];
  total_count: number;
}

export interface RawQueryResult {
  columns: string[];
  rows: Record<string, any>[];
  execution_time_ms: number;
  round_trip_ms?: number;
  rows_affected: number;
  is_mutation: boolean;
}

export interface ExplainResult {
  plan: any;
  estimated_rows?: number;
  actual_rows?: number;
  execution_time_ms?: number;
  index_used?: string;
  format?: string;
  raw?: string;
}

export interface QueryHistoryItem {
  id: string;
  query: string;
  timestamp: number;
  execution_time_ms?: number;
  round_trip_ms?: number;
  is_mutation?: boolean;
  row_count?: number;
  error?: string;
}

export interface ImportResult {
  inserted_count: number;
  duration_ms: number;
}

export type TabType = 'table' | 'query' | 'ddl' | 'erd';

export interface ERDResponse {
  tables: TableSchema[];
  relations: RelationSchema[];
}

export interface StudioTabState {
  page: number;
  pageSize?: number;
  filters: FilterOption[];
  sortBy: string;
  sortDesc: boolean;
  queryText?: string;
}

export interface StudioTab {
  id: string;
  type: TabType;
  title: string;
  tableName?: string;
  connectionId: string;
  state?: StudioTabState;
}

export interface TableIndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
  primary?: boolean;
}

export interface TableDDLResponse {
  table: string;
  engine: DatabaseType;
  ddl: string;
  indexes: TableIndexInfo[];
}

export type AuditAction =
  | 'login'
  | 'query_execute'
  | 'row_mutate'
  | 'schema_change'
  | 'connection_create';

export interface AuditEntry {
  id: string;
  user_id: string;
  username: string;
  action: AuditAction;
  resource: string;
  detail: string;
  ip: string;
  created_at: string;
}

// QueryHistoryEntry mirrors audit.Entry specifically for query_execute records.
export interface QueryHistoryEntry {
  id: string;
  user_id: string;
  username: string;
  action: AuditAction;
  resource: string;   // connection name
  detail: string;     // SQL text
  ip: string;
  created_at: string;
}

export interface AggregateResult {
  labels: string[];
  values: (number | string | null)[];
  stats?: {
    total_rows?: number;
    non_null_count?: number;
    null_count?: number;
    min?: number;
    max?: number;
    avg?: number;
    sum?: number;
    [key: string]: any;
  };
}

export interface TableStats {
  total_rows: number;
  size_bytes: number;
  estimated_rows?: boolean;
  last_updated?: string;
}

export interface SavedQuery {
  id: string;
  connection_id: string;
  user_id: string;
  title: string;
  query: string;
  tags: string[];
  folder?: string;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}

export interface SavedQueryInput {
  title: string;
  query: string;
  tags: string[];
  folder?: string;
  is_favorite: boolean;
}

export interface SavedQueryUpdateInput {
  title?: string;
  query?: string;
  tags?: string[];
  folder?: string;
  is_favorite?: boolean;
}

export interface MigrationPlanOperation {
  action: string;
  target_type: string;
  target_name: string;
  sql: string;
}

export interface MigrationResult {
  dry_run: boolean;
  success: boolean;
  statements_run: number;
  total_statements: number;
  error?: string;
  error_statement?: string;
  execution_time_ms: number;
  plan: MigrationPlanOperation[];
  rollback_sql?: string;
  migration_id?: string;
}

export interface MigrationRecord {
  id: string;
  connection_id: string;
  ddl: string;
  rollback_sql: string;
  success: boolean;
  error?: string;
  executed_at: string;
}

export interface MigrationHistoryResponse {
  items: MigrationRecord[];
  total_count: number;
}

export interface ExecuteMigrationInput {
  ddl: string;
  dry_run?: boolean;
}

export interface SeedSQLRequest {
  table: string;
  count?: number;
}

export interface SeedSQLResponse {
  table: string;
  count: number;
  tables_seeded: string[];
  sql: string;
}


