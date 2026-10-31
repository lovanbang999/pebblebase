import type { DatabaseType, EnvironmentType } from "@/lib/types";

export type EngineCategoryKey =
  "all" | "sql" | "nosql" | "inmemory" | "embedded" | "olap";

export interface DatabaseEngineDefinition {
  type: DatabaseType;
  name: string;
  label: string;
  category: string;
  categoryKey: "sql" | "nosql" | "inmemory" | "embedded" | "olap";
  tag: string;
  defaultPort: string;
  badge: string;
  accentColor: string;
}

export interface EngineCategoryTab {
  key: EngineCategoryKey;
  labelKey: string;
  fallbackLabel: string;
}

export const ENGINE_CATEGORIES: EngineCategoryTab[] = [
  {
    key: "all",
    labelKey: "connection.categories.all",
    fallbackLabel: "All Engines",
  },
  {
    key: "sql",
    labelKey: "connection.categories.sql",
    fallbackLabel: "Relational / SQL",
  },
  {
    key: "nosql",
    labelKey: "connection.categories.nosql",
    fallbackLabel: "Document / NoSQL",
  },
  {
    key: "inmemory",
    labelKey: "connection.categories.inmemory",
    fallbackLabel: "In-Memory / Cache",
  },
  {
    key: "embedded",
    labelKey: "connection.categories.embedded",
    fallbackLabel: "Embedded / File",
  },
  {
    key: "olap",
    labelKey: "connection.categories.olap",
    fallbackLabel: "Analytics / OLAP",
  },
];

export const DATABASE_ENGINES: DatabaseEngineDefinition[] = [
  {
    type: "postgres",
    name: "PostgreSQL",
    label: "PostgreSQL",
    category: "Relational / SQL",
    categoryKey: "sql",
    tag: "SQL",
    defaultPort: "5432",
    badge: "bg-muted text-muted-foreground border-border",
    accentColor: "#336791",
  },
  {
    type: "mysql",
    name: "MySQL",
    label: "MySQL",
    category: "Relational / SQL",
    categoryKey: "sql",
    tag: "SQL",
    defaultPort: "3306",
    badge: "bg-muted text-muted-foreground border-border",
    accentColor: "#00758F",
  },
  {
    type: "mongodb",
    name: "MongoDB",
    label: "MongoDB",
    category: "Document Store / NoSQL",
    categoryKey: "nosql",
    tag: "NoSQL",
    defaultPort: "27017",
    badge: "bg-muted text-muted-foreground border-border",
    accentColor: "#13AA52",
  },
  {
    type: "sqlite",
    name: "SQLite",
    label: "SQLite",
    category: "Embedded / File",
    categoryKey: "embedded",
    tag: "Embedded",
    defaultPort: "local-file",
    badge: "bg-muted text-muted-foreground border-border",
    accentColor: "#00A3E0",
  },
  {
    type: "redis",
    name: "Redis",
    label: "Redis",
    category: "In-Memory / Key-Value",
    categoryKey: "inmemory",
    tag: "Key-Value",
    defaultPort: "6379",
    badge: "bg-muted text-muted-foreground border-border",
    accentColor: "#DC382D",
  },
  {
    type: "mssql",
    name: "SQL Server",
    label: "Microsoft SQL Server",
    category: "Relational / SQL",
    categoryKey: "sql",
    tag: "MSSQL",
    defaultPort: "1433",
    badge: "bg-muted text-muted-foreground border-border",
    accentColor: "#CC292B",
  },
  {
    type: "clickhouse",
    name: "ClickHouse",
    label: "ClickHouse OLAP",
    category: "Column-Oriented / OLAP",
    categoryKey: "olap",
    tag: "OLAP",
    defaultPort: "9000",
    badge: "bg-muted text-muted-foreground border-border",
    accentColor: "#F59E0B",
  },
];

export function getDefaultPort(type: DatabaseType): string {
  const engine = DATABASE_ENGINES.find((e) => e.type === type);
  return engine ? engine.defaultPort : "5432";
}

export interface EnvironmentDefinition {
  key: EnvironmentType;
  label: string;
  selectedClass: string;
  dotClass: string;
  dotRingClass: string;
  style: {
    bg: string;
    text: string;
    dot: string;
    border: string;
  };
}

export const DATABASE_ENVIRONMENTS: EnvironmentDefinition[] = [
  {
    key: "local",
    label: "Local",
    selectedClass:
      "text-success bg-success/10 border-success/40 ring-1 ring-success/30",
    dotClass: "bg-success",
    dotRingClass: "bg-success ring-success/20",
    style: {
      bg: "bg-success/10",
      text: "text-success",
      dot: "bg-success",
      border: "border-success/25",
    },
  },
  {
    key: "development",
    label: "Development",
    selectedClass:
      "text-warning bg-warning/10 border-warning/40 ring-1 ring-warning/30",
    dotClass: "bg-warning",
    dotRingClass: "bg-warning ring-warning/20",
    style: {
      bg: "bg-warning/10",
      text: "text-warning",
      dot: "bg-warning",
      border: "border-warning/25",
    },
  },
  {
    key: "staging",
    label: "Staging",
    selectedClass:
      "text-primary bg-primary/10 border-primary/40 ring-1 ring-primary/30",
    dotClass: "bg-primary",
    dotRingClass: "bg-primary ring-primary/20",
    style: {
      bg: "bg-primary/10",
      text: "text-primary",
      dot: "bg-primary",
      border: "border-primary/25",
    },
  },
  {
    key: "production",
    label: "Production",
    selectedClass:
      "text-destructive bg-destructive/10 border-destructive/40 ring-1 ring-destructive/30",
    dotClass: "bg-destructive",
    dotRingClass: "bg-destructive ring-destructive/20",
    style: {
      bg: "bg-destructive/10",
      text: "text-destructive",
      dot: "bg-destructive",
      border: "border-destructive/25",
    },
  },
];

export const ENV_DOTS: Record<string, string> = Object.fromEntries(
  DATABASE_ENVIRONMENTS.map((e) => [e.key, e.dotRingClass]),
);

export const ENV_STYLES: Record<string, EnvironmentDefinition["style"]> =
  Object.fromEntries(DATABASE_ENVIRONMENTS.map((e) => [e.key, e.style]));
