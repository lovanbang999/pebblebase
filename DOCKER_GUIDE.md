# Pebblebase Docker Deployment & Sharing Guide

This guide explains how to build and publish the **Pebblebase Studio** Docker image to Docker Hub, allowing team members to pull and run the application without needing to clone the source code or install local dependencies.

---

## 📦 Step 1: Build & Push to Docker Hub (Maintainer Setup)

Run these 3 commands in your terminal to compile the standalone image and publish it:

```bash
# 1. Log in to your Docker Hub account
docker login

# 2. Build the Docker image tagged with your Docker Hub username
docker build -t lovanbang/pebblebase:latest .

# 3. Push the image to Docker Hub
docker push lovanbang/pebblebase:latest
```

> **Note:** Replace `lovanbang999` with your exact Docker Hub username if different.

---

## 🚀 Step 2: How Teammates Use It (Zero Source Code Required)

Once pushed to Docker Hub, team members can run Pebblebase Studio on their machine in either of the following two ways:

### Option A: Single Terminal Command (1-Line Quickstart)

Teammates open their terminal and run:

```bash
docker run -d -p 8090:8080 --name pebblebase lovanbang/pebblebase:latest
```

Then open **[http://localhost:8090](http://localhost:8090)** in their web browser! No source code cloning or configuration required.

---

### Option B: Standalone `docker-compose.yml` (Studio + Pre-Seeded Databases)

If teammates want **Pebblebase Studio** alongside local test databases (**PostgreSQL**, **MySQL**, **MongoDB**) pre-populated with realistic seed data, they can save this single `docker-compose.yml` file anywhere on their computer:

```yaml
services:
  studio:
    image: lovanbang999/pebblebase:latest
    ports:
      - "8080:8080"

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: pebble
      POSTGRES_PASSWORD: pebble
      POSTGRES_DB: pebble_test
    ports:
      - "5432:5432"

  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: pebble
      MYSQL_DATABASE: pebble_test
      MYSQL_USER: pebble
      MYSQL_PASSWORD: pebble
    ports:
      - "3306:3306"
```

And run:

```bash
docker compose up -d
```

---

## 💡 Quick Reference

| Action | Command | URL / Access |
|---|---|---|
| **Run 1-Line Container** | `docker run -d -p 8090:8080 --name pebblebase lovanbang/pebblebase:latest` | `http://localhost:8090` |
| **Run Studio + DB Stack** | `docker compose up -d` | `http://localhost:8090` |
| **Stop Running Studio** | `docker stop pebblebase` | — |
