# =============================================================================
# Stage 1: Build frontend
# =============================================================================
FROM node:22-alpine AS frontend-builder

WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

# =============================================================================
# Stage 2: Build Go binary
# =============================================================================
FROM golang:1.25-alpine AS go-builder

WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download

COPY . .
# Copy compiled frontend assets before building Go (embedded via go:embed)
COPY --from=frontend-builder /app/web/dist ./web/dist

# Prepare /data directory owned by nonroot (uid 65532) for SQLite/JSON storage
RUN mkdir -p /data && chown -R 65532:65532 /data

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o pebblebase ./cmd/server

# =============================================================================
# Stage 3: Minimal runtime image
# Distroless static non-root (includes CA certificates for cloud DB connections)
# =============================================================================
FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=go-builder --chown=65532:65532 /data /data
COPY --from=go-builder /app/pebblebase /pebblebase

USER nonroot:nonroot
VOLUME ["/data"]
ENV DATA_DIR=/data
EXPOSE 8080

ENTRYPOINT ["/pebblebase"]
