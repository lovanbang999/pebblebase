import type {
  Connection,
  ConnectionInput,
  RowQueryParams,
  TableSchema,
  QueryResult,
  RawQueryResult,
  TableDDLResponse,
  AuditEntry,
  AggregateResult,
  TableStats,
  FilterOption,
} from './types';
import { getAuthHeaders, useAuthStore } from './auth';

const BASE_URL = '/api';

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    useAuthStore.getState().clearAuth();
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok) {
    let errorMsg = `HTTP ${res.status}: ${res.statusText}`;
    try {
      const data = await res.json();
      if (data && data.error) {
        errorMsg = data.error;
      }
    } catch {
      // not json error response
    }
    throw new Error(errorMsg);
  }
  if (res.status === 204) {
    return {} as T;
  }
  return res.json();
}

export async function fetchConnections(): Promise<Connection[]> {
  const res = await fetch(`${BASE_URL}/connections`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<Connection[]>(res);
}

export async function testConnection(input: ConnectionInput): Promise<{ status: string }> {
  const res = await fetch(`${BASE_URL}/connections/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(input),
  });
  return handleResponse<{ status: string }>(res);
}

export async function createConnection(input: ConnectionInput): Promise<Connection> {
  const res = await fetch(`${BASE_URL}/connections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(input),
  });
  return handleResponse<Connection>(res);
}

export async function deleteConnection(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/connections/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  await handleResponse<void>(res);
}

export async function pingConnection(id: string): Promise<{ status: string }> {
  const res = await fetch(`${BASE_URL}/connections/${encodeURIComponent(id)}/ping`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return handleResponse<{ status: string }>(res);
}

export async function fetchTables(connId: string): Promise<TableSchema[]> {
  const res = await fetch(`${BASE_URL}/connections/${encodeURIComponent(connId)}/tables`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<TableSchema[]>(res);
}

export async function fetchRows(
  connId: string,
  table: string,
  params: RowQueryParams = {}
): Promise<QueryResult> {
  const searchParams = new URLSearchParams();
  if (params.limit !== undefined) searchParams.set('limit', String(params.limit));
  if (params.offset !== undefined) searchParams.set('offset', String(params.offset));
  if (params.sort_by) searchParams.set('sort_by', params.sort_by);
  if (params.sort_desc) searchParams.set('sort_desc', 'true');

  if (params.filters && params.filters.length > 0) {
    for (const f of params.filters) {
      if (f.column && f.operator && f.value !== '') {
        searchParams.append('filter', `${f.column}:${f.operator}:${f.value}`);
      }
    }
  }

  const queryStr = searchParams.toString();
  const url = `${BASE_URL}/connections/${encodeURIComponent(connId)}/tables/${encodeURIComponent(table)}/rows${queryStr ? `?${queryStr}` : ''}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  return handleResponse<QueryResult>(res);
}

export async function insertRow(
  connId: string,
  table: string,
  values: Record<string, any>
): Promise<void> {
  const res = await fetch(
    `${BASE_URL}/connections/${encodeURIComponent(connId)}/tables/${encodeURIComponent(table)}/rows`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ values }),
    }
  );
  await handleResponse<void>(res);
}

export async function updateRow(
  connId: string,
  table: string,
  where: Record<string, any>,
  values: Record<string, any>
): Promise<void> {
  const res = await fetch(
    `${BASE_URL}/connections/${encodeURIComponent(connId)}/tables/${encodeURIComponent(table)}/rows`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ where, values }),
    }
  );
  await handleResponse<void>(res);
}

export async function deleteRow(
  connId: string,
  table: string,
  where: Record<string, any>
): Promise<void> {
  const res = await fetch(
    `${BASE_URL}/connections/${encodeURIComponent(connId)}/tables/${encodeURIComponent(table)}/rows`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ where }),
    }
  );
  await handleResponse<void>(res);
}

export async function executeRawQuery(
  connId: string,
  query: string
): Promise<RawQueryResult> {
  const res = await fetch(
    `${BASE_URL}/connections/${encodeURIComponent(connId)}/query`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ query }),
    }
  );
  return handleResponse<RawQueryResult>(res);
}

export function getTableExportUrl(
  connId: string,
  table: string,
  format: 'csv' | 'json',
  params: RowQueryParams = {}
): string {
  const searchParams = new URLSearchParams();
  searchParams.set('format', format);
  if (params.sort_by) searchParams.set('sort_by', params.sort_by);
  if (params.sort_desc) searchParams.set('sort_desc', 'true');
  if (params.filters && params.filters.length > 0) {
    for (const f of params.filters) {
      if (f.column && f.operator && f.value !== '') {
        searchParams.append('filter', `${f.column}:${f.operator}:${f.value}`);
      }
    }
  }
  const queryStr = searchParams.toString();
  return `${BASE_URL}/connections/${encodeURIComponent(connId)}/tables/${encodeURIComponent(table)}/export?${queryStr}`;
}

export async function exportTableData(
  connId: string,
  table: string,
  format: 'csv' | 'json',
  params: RowQueryParams = {}
): Promise<Blob> {
  const url = getTableExportUrl(connId, table, format, params);
  const res = await fetch(url, {
    headers: getAuthHeaders(),
  });
  if (res.status === 401) {
    useAuthStore.getState().clearAuth();
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok) {
    let errorMsg = `HTTP ${res.status}: ${res.statusText}`;
    try {
      const data = await res.json();
      if (data && data.error) {
        errorMsg = data.error;
      }
    } catch {
      // not json error
    }
    throw new Error(errorMsg);
  }
  return res.blob();
}

export async function importTableCSV(
  connId: string,
  table: string,
  file: File,
  mappings?: Record<string, string>
): Promise<{ inserted_count: number; duration_ms: number }> {
  const formData = new FormData();
  formData.append('file', file);
  if (mappings && Object.keys(mappings).length > 0) {
    formData.append('mappings', JSON.stringify(mappings));
  }
  const res = await fetch(
    `${BASE_URL}/connections/${encodeURIComponent(connId)}/tables/${encodeURIComponent(table)}/import`,
    {
      method: 'POST',
      body: formData,
    }
  );
  return handleResponse<{ inserted_count: number; duration_ms: number }>(res);
}

export async function fetchTableDDL(
  connId: string,
  table: string
): Promise<TableDDLResponse> {
  const res = await fetch(
    `${BASE_URL}/connections/${encodeURIComponent(connId)}/tables/${encodeURIComponent(table)}/ddl`,
    { headers: getAuthHeaders() }
  );
  return handleResponse<TableDDLResponse>(res);
}

// ---------------------------------------------------------------------------
// Auth API
// ---------------------------------------------------------------------------

export async function apiLogin(
  username: string,
  password: string
): Promise<{ token: string; user: import('./auth').AuthUser; is_default_password: boolean }> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return handleResponse(res);
}

export async function apiLogout(): Promise<void> {
  const res = await fetch(`${BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  await handleResponse<void>(res);
}

export async function fetchMe(): Promise<{
  user: import('./auth').AuthUser;
  is_default_password: boolean;
}> {
  const res = await fetch(`${BASE_URL}/auth/me`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

export async function fetchUsers(): Promise<{ users: import('./auth').AuthUser[] }> {
  const res = await fetch(`${BASE_URL}/auth/users`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

export async function createUser(
  username: string,
  password: string,
  role: import('./auth').AuthRole
): Promise<import('./auth').AuthUser> {
  const res = await fetch(`${BASE_URL}/auth/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ username, password, role }),
  });
  return handleResponse(res);
}

export async function deleteUser(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/auth/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  await handleResponse<void>(res);
}

export async function changePassword(
  userId: string,
  oldPassword: string,
  newPassword: string
): Promise<void> {
  const res = await fetch(`${BASE_URL}/auth/users/${encodeURIComponent(userId)}/password`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
  });
  await handleResponse<void>(res);
}

export async function fetchAuditLogs(
  limit = 50,
  offset = 0
): Promise<{ entries: AuditEntry[]; total_count: number }> {
  const res = await fetch(
    `${BASE_URL}/audit/logs?limit=${limit}&offset=${offset}`,
    { headers: getAuthHeaders() }
  );
  return handleResponse(res);
}

export async function fetchAggregate(
  connectionId: string,
  table: string,
  column: string,
  fn: string = 'distribution',
  groupBy: string = 'day',
  filters: FilterOption[] = [],
  limit = 10
): Promise<AggregateResult> {
  const params = new URLSearchParams();
  params.set('column', column);
  params.set('function', fn);
  params.set('group_by', groupBy);
  params.set('limit', String(limit));
  for (const f of filters) {
    if (f.column && f.operator && f.value !== undefined && f.value !== '') {
      params.append('filter', `${f.column}:${f.operator}:${f.value}`);
    }
  }

  const res = await fetch(
    `${BASE_URL}/connections/${encodeURIComponent(connectionId)}/tables/${encodeURIComponent(table)}/aggregate?${params.toString()}`,
    { headers: getAuthHeaders() }
  );
  return handleResponse<AggregateResult>(res);
}

export async function fetchTableStats(
  connectionId: string,
  table: string
): Promise<TableStats> {
  const res = await fetch(
    `${BASE_URL}/connections/${encodeURIComponent(connectionId)}/tables/${encodeURIComponent(table)}/stats`,
    { headers: getAuthHeaders() }
  );
  return handleResponse<TableStats>(res);
}

