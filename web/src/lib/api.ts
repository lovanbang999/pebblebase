import type {
  Connection,
  ConnectionInput,
  RowQueryParams,
  TableSchema,
  QueryResult,
} from './types';

const BASE_URL = '/api';

async function handleResponse<T>(res: Response): Promise<T> {
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
  const res = await fetch(`${BASE_URL}/connections`);
  return handleResponse<Connection[]>(res);
}

export async function testConnection(input: ConnectionInput): Promise<{ status: string }> {
  const res = await fetch(`${BASE_URL}/connections/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<{ status: string }>(res);
}

export async function createConnection(input: ConnectionInput): Promise<Connection> {
  const res = await fetch(`${BASE_URL}/connections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<Connection>(res);
}

export async function deleteConnection(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/connections/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  await handleResponse<void>(res);
}

export async function pingConnection(id: string): Promise<{ status: string }> {
  const res = await fetch(`${BASE_URL}/connections/${encodeURIComponent(id)}/ping`, {
    method: 'POST',
  });
  return handleResponse<{ status: string }>(res);
}

export async function fetchTables(connId: string): Promise<TableSchema[]> {
  const res = await fetch(`${BASE_URL}/connections/${encodeURIComponent(connId)}/tables`);
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
  const res = await fetch(url);
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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ where }),
    }
  );
  await handleResponse<void>(res);
}
