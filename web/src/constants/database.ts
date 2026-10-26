import type { DatabaseType, EnvironmentType } from "@/lib/types";

export type EngineCategoryKey =
  "all" | "sql" | "nosql" | "inmemory" | "embedded";

export interface DatabaseEngineDefinition {
  type: DatabaseType;
  name: string;
  label: string;
  category: string;
  categoryKey: "sql" | "nosql" | "inmemory" | "embedded";
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
    badge:
      "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20",
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
    badge:
      "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
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
    badge:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
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
    badge: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20",
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
    badge: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
    accentColor: "#DC382D",
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
      "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 dark:bg-emerald-500/15 border-emerald-500/40 dark:border-emerald-500/40 ring-1 ring-emerald-500/30",
    dotClass: "bg-emerald-500",
    dotRingClass: "bg-emerald-500 ring-emerald-500/20",
    style: {
      bg: "bg-emerald-500/10 dark:bg-emerald-500/15",
      text: "text-emerald-700 dark:text-emerald-400",
      dot: "bg-emerald-500",
      border: "border-emerald-500/25",
    },
  },
  {
    key: "development",
    label: "Development",
    selectedClass:
      "text-amber-700 dark:text-amber-300 bg-amber-500/10 dark:bg-amber-500/15 border-amber-500/40 dark:border-amber-500/40 ring-1 ring-amber-500/30",
    dotClass: "bg-amber-500",
    dotRingClass: "bg-amber-500 ring-amber-500/20",
    style: {
      bg: "bg-amber-500/10 dark:bg-amber-500/15",
      text: "text-amber-700 dark:text-amber-400",
      dot: "bg-amber-500",
      border: "border-amber-500/25",
    },
  },
  {
    key: "staging",
    label: "Staging",
    selectedClass:
      "text-orange-700 dark:text-orange-300 bg-orange-500/10 dark:bg-orange-500/15 border-orange-500/40 dark:border-orange-500/40 ring-1 ring-orange-500/30",
    dotClass: "bg-orange-500",
    dotRingClass: "bg-orange-500 ring-orange-500/20",
    style: {
      bg: "bg-orange-500/10 dark:bg-orange-500/15",
      text: "text-orange-700 dark:text-orange-400",
      dot: "bg-orange-500",
      border: "border-orange-500/25",
    },
  },
  {
    key: "production",
    label: "Production",
    selectedClass:
      "text-rose-700 dark:text-rose-300 bg-rose-500/10 dark:bg-rose-500/15 border-rose-500/40 dark:border-rose-500/40 ring-1 ring-rose-500/30",
    dotClass: "bg-rose-500",
    dotRingClass: "bg-rose-500 ring-rose-500/20",
    style: {
      bg: "bg-rose-500/10 dark:bg-rose-500/15",
      text: "text-rose-700 dark:text-rose-400",
      dot: "bg-rose-500",
      border: "border-rose-500/25",
    },
  },
];

export const ENV_DOTS: Record<string, string> = Object.fromEntries(
  DATABASE_ENVIRONMENTS.map((e) => [e.key, e.dotRingClass]),
);

export const ENV_STYLES: Record<string, EnvironmentDefinition["style"]> =
  Object.fromEntries(DATABASE_ENVIRONMENTS.map((e) => [e.key, e.style]));
