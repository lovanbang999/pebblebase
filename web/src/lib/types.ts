export type DatabaseType = 'postgres' | 'mysql' | 'mongodb';

export interface Connection {
  id: string;
  name: string;
  type: DatabaseType;
  host: string;
  port: string;
  user: string;
  db_name: string;
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
