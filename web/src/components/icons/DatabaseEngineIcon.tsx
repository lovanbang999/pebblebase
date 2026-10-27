import type { FC, ImgHTMLAttributes } from "react";
import type { DatabaseType } from "@/lib/types";

interface DatabaseEngineIconProps extends Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "alt"
> {
  type: DatabaseType | string;
  className?: string;
  size?: number | string;
}

const ENGINE_ICON_PATHS: Record<string, string> = {
  postgres: "/icons/engines/postgresql.svg",
  postgresql: "/icons/engines/postgresql.svg",
  mysql: "/icons/engines/mysql.svg",
  mongodb: "/icons/engines/mongodb.svg",
  sqlite: "/icons/engines/sqlite.svg",
  redis: "/icons/engines/redis.svg",
  mssql: "/icons/engines/mssql.svg",
  clickhouse: "/icons/engines/clickhouse.svg",
};

export const DatabaseEngineIcon: FC<DatabaseEngineIconProps> = ({
  type,
  className = "size-5",
  size,
  style,
  ...props
}) => {
  const normalized = (type || "").toLowerCase();
  const iconSrc =
    ENGINE_ICON_PATHS[normalized] || "/icons/engines/postgresql.svg";
  const inlineStyle = size ? { width: size, height: size, ...style } : style;

  return (
    <img
      src={iconSrc}
      alt={type}
      className={className}
      style={inlineStyle}
      draggable={false}
      {...props}
    />
  );
};
