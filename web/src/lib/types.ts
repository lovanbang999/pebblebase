export type DatabaseType =
  | "postgres"
  | "mysql"
  | "mongodb"
  | "sqlite"
  | "redis"
  | "mssql"
  | "clickhouse";
export type EnvironmentType =
  "local" | "development" | "staging" | "production";

export interface RedisKeyMetadata {
  key: string;
  type:
    "string" | "hash" | "list" | "set" | "zset" | "stream" | "none" | string;
  ttl: number;
  memory_usage: number;
  length?: number;
}

export interface RedisZSetMember {
  member: string;
  score: number;
}

export interface RedisStreamEntry {
  id: string;
  values: Record<string, unknown>;
}

export interface RedisKeyDetail extends RedisKeyMetadata {
  value:
    | string
    | Record<string, string>
    | string[]
    | RedisZSetMember[]
    | RedisStreamEntry[]
    | null;
}

export interface RedisScanResponse {
  keys: RedisKeyMetadata[];
  next_cursor: number;
  total_keys: number;
}

export interface Connection {
  id: string;
  name: string;
  type: DatabaseType;
  mode?: "form" | "url";
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
  mode: "form" | "url";
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
  ssl_mode?: string;
  windows_auth?: boolean;
  preserve_existing_dsn?: boolean;
  connection_id?: string;
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
  type: "one_to_one" | "one_to_many" | "many_to_many";
  from_table: string;
  from_column: string;
  to_table: string;
  to_column: string;
}

export interface TableSchema {
  name: string;
  /** Optional qualified schema identity when an adapter supplies it. */
  schema_name?: string;
  columns: ColumnSchema[];
  relations: RelationSchema[];
}

export interface FilterOption {
  column: string;
  operator: "eq" | "neq" | "gt" | "lt" | "contains";
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
  query_time_ms?: number;
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

export type TabType = "table" | "query" | "ddl" | "erd" | "diff";

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
  diffSourceConnectionId?: string;
  diffTargetConnectionId?: string;
  scrollLeft?: number;
  scrollTop?: number;
}

export interface StudioTab {
  id: string;
  type: TabType;
  title: string;
  tableName?: string;
  schemaName?: string;
  /** Stable logical object identity; query tabs use a generated editor identity. */
  objectId?: string;
  connectionId: string;
  state?: StudioTabState;
  isDirty?: boolean;
}

export type ExplorerSelection =
  | { kind: "connection"; connectionId: string }
  | {
      kind: "table";
      connectionId: string;
      tableName: string;
      schemaName?: string;
    }
  | null;

export interface WorkspaceToolWindows {
  database: boolean;
  scripts: boolean;
  output: boolean;
  ai: boolean;
}

export interface PersistedWorkspace {
  version: 1;
  tabs: StudioTab[];
  activeTabId: string | null;
  selectedExplorerNode: ExplorerSelection;
  expandedNodeIds: string[];
  toolWindows: WorkspaceToolWindows;
  sidebarWidth: number;
  initialized: boolean;
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
  | "login"
  | "query_execute"
  | "row_mutate"
  | "schema_change"
  | "connection_create";

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
  resource: string; // connection name
  detail: string; // SQL text
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

export type DiffStatus = "added" | "removed" | "modified" | "unchanged";

export interface DiffConnectionInfo {
  id: string;
  name: string;
  engine: string;
}

export interface ColumnDiff {
  name: string;
  status: DiffStatus;
  from_column?: ColumnSchema;
  to_column?: ColumnSchema;
  changes?: string[];
}

export interface IndexDiff {
  name: string;
  status: DiffStatus;
  from_index?: TableIndexInfo;
  to_index?: TableIndexInfo;
  changes?: string[];
}

export interface TableDiff {
  name: string;
  status: DiffStatus;
  columns: ColumnDiff[];
  indexes: IndexDiff[];
}

export interface DiffSummary {
  tables_added: number;
  tables_removed: number;
  tables_modified: number;
  tables_unchanged: number;
  columns_added: number;
  columns_removed: number;
  columns_modified: number;
  indexes_added: number;
  indexes_removed: number;
  indexes_modified: number;
}

export interface SchemaDiffResult {
  from_connection: DiffConnectionInfo;
  to_connection: DiffConnectionInfo;
  tables: TableDiff[];
  summary: DiffSummary;
  migration_sql: string;
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  downloadUrl: string;
  releaseNotes: string;
  publishedAt: string;
  size: number;
  signature?: string;
  requiresSig: boolean;
  assetFound: boolean;
}

export interface UpdateSettings {
  checkOnStartup: boolean;
  channel: string;
}

export type AIProviderType =
  "openai" | "gemini" | "anthropic" | "groq" | "ollama";

export interface AIConfig {
  provider: AIProviderType;
  model: string;
  base_url: string;
  api_key?: string;
  has_key: boolean;
  key_mask: string;
  temperature: number;
  max_tokens: number;
}

export interface AISaveConfigInput {
  provider: AIProviderType;
  model: string;
  base_url: string;
  api_key?: string;
  temperature?: number;
  max_tokens?: number;
}

export interface AITestResult {
  ok: boolean;
  latency_ms: number;
  message: string;
  available_models?: string[];
}

export interface AIProviderInfo {
  id: AIProviderType;
  name: string;
  default_base_url: string;
  default_model: string;
  models: string[];
  requires_key: boolean;
  doc_url: string;
}

export type AIQueryAssistMode = "generate" | "fix" | "explain";

export interface TableSchemaSummary {
  name: string;
  columns: string[];
  primary_keys?: string[];
  foreign_keys?: string[];
}

export interface AIQueryAssistRequest {
  mode: AIQueryAssistMode;
  engine: string;
  prompt?: string;
  current_query?: string;
  error_message?: string;
  explain_plan?: string;
  schema?: TableSchemaSummary[];
}

export interface AIQueryAssistResponse {
  query: string;
  explanation: string;
  indexes?: string[];
}
