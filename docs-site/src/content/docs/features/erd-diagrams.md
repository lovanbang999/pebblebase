---
title: Visual ERD Diagrams
description: Automatically map and visualize relational database schemas with interactive entity relationship diagrams.
---

Press `Alt+E` (or `Option+E` on macOS) to open the interactive **Entity Relationship Diagram (ERD)** view for your active database connection.

---

## Interactive Visual Features

- **Automated Layout**: Uses DAG (Directed Acyclic Graph) algorithms via `@xyflow/react` and `dagre` to cleanly position related tables without spaghetti lines.
- **Relationship Tracing**: Hover or click on foreign key connectors to highlight relationships between parent and child tables.
- **Canvas Navigation**:
  - Smooth pan and zoom with trackpad or mouse wheel.
  - Minimap for fast navigation in databases with 50+ tables.
  - Fit to view button to instantly center the schema.
- **Generate JOIN Queries**: Click between two connected tables in the ERD to automatically draft a valid SQL `SELECT ... JOIN` query in the Query Console.
