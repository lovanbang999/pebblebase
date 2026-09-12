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
# Copy compiled frontend assets before building Go (needed for go:embed in Phase 6)
COPY --from=frontend-builder /app/web/dist ./web/dist

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o pebblebase ./cmd/server

# =============================================================================
# Stage 3: Minimal runtime image
# NOTE: Phase 0 uses distroless/static for simplicity.
#       Phase 6 will switch to scratch after embed is wired up.
# =============================================================================
FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=go-builder /app/pebblebase /pebblebase

EXPOSE 8080

ENTRYPOINT ["/pebblebase"]
