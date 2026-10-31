import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSchemaMetadata } from "@/lib/api";
import { mapSchemaMetadata, schemaMetadataKey } from "@/lib/schemaMetadata";
export function useSchemaMetadata(connectionId: string, table?: string) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: schemaMetadataKey(connectionId, table),
    queryFn: ({ signal }) =>
      fetchSchemaMetadata(connectionId, table, signal).then(mapSchemaMetadata),
    enabled: Boolean(connectionId),
    staleTime: 60_000,
  });
  const refresh = useCallback(
    () =>
      client.invalidateQueries({ queryKey: ["schema-metadata", connectionId] }),
    [client, connectionId],
  );
  return { ...query, refresh };
}
