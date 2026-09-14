package main

import (
	"database/sql"
	"encoding/base64"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"pebblebase"
	"pebblebase/internal/api"
	"pebblebase/internal/audit"
	"pebblebase/internal/auth"
	"pebblebase/internal/storage"

	_ "modernc.org/sqlite"
)

func main() {
	port := envOr("PORT", "8080")
	dataDir := envOr("DATA_DIR", "./data")
	authEnabled := envOr("PEBBLEBASE_AUTH_ENABLED", "true") != "false"

	// Load or generate the AES-256 master key.
	key, err := storage.LoadOrGenerateKey(dataDir)
	if err != nil {
		log.Fatalf("load master key: %v", err)
	}

	enc, err := storage.NewEncryptor(key)
	if err != nil {
		log.Fatalf("create encryptor: %v", err)
	}

	store, err := storage.NewStore(dataDir, enc)
	if err != nil {
		log.Fatalf("create store: %v", err)
	}

	// Open shared SQLite metadata DB for users + audit log.
	metaDBPath := filepath.Join(dataDir, "meta.db")
	if err := os.MkdirAll(dataDir, 0700); err != nil {
		log.Fatalf("create data dir: %v", err)
	}
	metaDB, err := sql.Open("sqlite", metaDBPath)
	if err != nil {
		log.Fatalf("open meta db: %v", err)
	}
	defer metaDB.Close()

	// Enable WAL mode for better concurrent read performance.
	if _, err := metaDB.Exec("PRAGMA journal_mode=WAL"); err != nil {
		log.Printf("warning: set WAL mode: %v", err)
	}

	// Wire auth components.
	var authSvc *auth.Service
	var auditLog *audit.Logger

	if authEnabled {
		jwtSecret, err := loadOrGenerateJWTSecret(dataDir)
		if err != nil {
			log.Fatalf("load JWT secret: %v", err)
		}

		userStore, err := auth.NewStore(metaDB)
		if err != nil {
			log.Fatalf("create auth store: %v", err)
		}

		jwtMgr := auth.NewJWTManager(jwtSecret)
		authSvc = auth.NewService(userStore, jwtMgr)

		auditLog, err = audit.NewLogger(metaDB)
		if err != nil {
			log.Fatalf("create audit logger: %v", err)
		}
		log.Printf("Authentication enabled")
	} else {
		log.Printf("Authentication disabled (PEBBLEBASE_AUTH_ENABLED=false)")
	}

	mux := http.NewServeMux()

	// Health check.
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"OK"}`))
	})

	// API routes.
	srv := api.NewServer(store, enc, authSvc, auditLog, authEnabled)
	srv.RegisterRoutes(mux)

	// Embedded frontend SPA routes.
	frontendFS, err := pebblebase.FrontendFS()
	if err != nil {
		log.Printf("warning: embedded frontend not available: %v", err)
	} else {
		mux.Handle("/", spaHandler(frontendFS))
	}

	addr := ":" + port
	log.Printf("Pebblebase server starting on %s (data: %s, auth: %v)", addr, dataDir, authEnabled)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("server: %v", err)
	}
}

// loadOrGenerateJWTSecret reads the JWT signing secret from the PEBBLEBASE_JWT_SECRET
// env var (base64-encoded). If not set, it auto-generates one and persists it in
// dataDir/.jwt_secret so sessions survive restarts in dev mode.
func loadOrGenerateJWTSecret(dataDir string) ([]byte, error) {
	if envVal := os.Getenv("PEBBLEBASE_JWT_SECRET"); envVal != "" {
		secret, err := base64.StdEncoding.DecodeString(envVal)
		if err != nil {
			// Treat it as raw bytes if it's not valid base64
			return []byte(envVal), nil
		}
		return secret, nil
	}

	secretPath := filepath.Join(dataDir, ".jwt_secret")
	if data, err := os.ReadFile(secretPath); err == nil {
		decoded, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(data)))
		if err == nil {
			return decoded, nil
		}
	}

	// Generate a new random 32-byte secret.
	secret := make([]byte, 32)
	if _, err := strings.NewReader("pebblebase-jwt-auto-secret-salt-").Read(secret); err != nil {
		// Fallback: just use a fixed dev secret — overrideable via env.
		log.Printf("warning: using fixed dev JWT secret — set PEBBLEBASE_JWT_SECRET for production")
		return []byte("pebblebase-dev-jwt-secret-32byte"), nil
	}

	encoded := base64.StdEncoding.EncodeToString(secret)
	if err := os.WriteFile(secretPath, []byte(encoded), 0600); err != nil {
		log.Printf("warning: could not persist JWT secret: %v", err)
	}
	return secret, nil
}

// spaHandler serves embedded static assets or falls back to index.html for SPA routing.
func spaHandler(frontendFS fs.FS) http.Handler {
	fileServer := http.FileServer(http.FS(frontendFS))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cleanPath := strings.TrimPrefix(filepath.Clean(r.URL.Path), "/")

		// If path corresponds to an existing static file, serve it directly.
		if cleanPath != "" && cleanPath != "." {
			if f, err := frontendFS.Open(cleanPath); err == nil {
				f.Close()
				fileServer.ServeHTTP(w, r)
				return
			}
		}

		// Nonexistent API routes return 404 JSON instead of HTML
		if strings.HasPrefix(r.URL.Path, "/api/") {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			w.Write([]byte(`{"error":"not found"}`))
			return
		}

		// Client-side routing fallback: serve index.html
		r.URL.Path = "/"
		fileServer.ServeHTTP(w, r)
	})
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
