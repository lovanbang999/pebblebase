---
title: Docker Compose Self-Hosting
description: Deploy Pebblebase Studio as a private web application with Docker Compose.
---

Pebblebase Studio can be run as a containerized web portal, allowing team members to access database tools through their browser with centralized authentication.

---

## Quick Start with Docker Compose

Save this configuration as `docker-compose.yml`:

```yaml
version: '3.8'

services:
  pebblebase:
    image: ghcr.io/lovanbang999/pebblebase:latest
    container_name: pebblebase-studio
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - pebblebase_data:/data
    environment:
      - PORT=8080
      - DATA_DIR=/data
      - PEBBLEBASE_AUTH_ENABLED=true

volumes:
  pebblebase_data:
```

Launch the container:
```bash
docker compose up -d
```

Access the studio at `http://localhost:8080`.
