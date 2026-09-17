package app

import (
	"database/sql"
	"encoding/base64"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"pebblebase/internal/api"
	"pebblebase/internal/audit"
	"pebblebase/internal/auth"
	"pebblebase/internal/migration"
	"pebblebase/internal/savedquery"
	"pebblebase/internal/storage"

	_ "modernc.org/sqlite"
)

// Instance represents a running Pebblebase core instance.
type Instance struct {
	Mux         *http.ServeMux
	DataDir     string
	MetaDB      *sql.DB
	AuthEnabled bool
}

// Close releases resources held by the instance.
func (inst *Instance) Close() error {
	if inst.MetaDB != nil {
		return inst.MetaDB.Close()
	}
	return nil
}

// Bootstrap initializes the database engines, encryption, auth, audit, and API routes.
func Bootstrap(dataDir string, authEnabled bool) (*Instance, error) {
	if err := os.MkdirAll(dataDir, 0700); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}

	// 1. Load or generate the AES-256 master key.
	key, err := storage.LoadOrGenerateKey(dataDir)
	if err != nil {
		return nil, fmt.Errorf("load master key: %w", err)
	}

	enc, err := storage.NewEncryptor(key)
	if err != nil {
		return nil, fmt.Errorf("create encryptor: %w", err)
	}

	store, err := storage.NewStore(dataDir, enc)
	if err != nil {
		return nil, fmt.Errorf("create store: %w", err)
	}

	// 2. Open shared SQLite metadata DB for users, audit logs, saved queries & migrations.
	metaDBPath := filepath.Join(dataDir, "meta.db")
	metaDB, err := sql.Open("sqlite", metaDBPath)
	if err != nil {
		return nil, fmt.Errorf("open meta db: %w", err)
	}

	if _, err := metaDB.Exec("PRAGMA journal_mode=WAL"); err != nil {
		log.Printf("warning: set WAL mode: %v", err)
	}

	// 3. Wire auth & audit components.
	var authSvc *auth.Service
	var auditLog *audit.Logger

	if authEnabled {
		jwtSecret, err := loadOrGenerateJWTSecret(dataDir)
		if err != nil {
			metaDB.Close()
			return nil, fmt.Errorf("load JWT secret: %w", err)
		}

		userStore, err := auth.NewStore(metaDB)
		if err != nil {
			metaDB.Close()
			return nil, fmt.Errorf("create auth store: %w", err)
		}

		jwtMgr := auth.NewJWTManager(jwtSecret)
		authSvc = auth.NewService(userStore, jwtMgr)

		auditLog, err = audit.NewLogger(metaDB)
		if err != nil {
			metaDB.Close()
			return nil, fmt.Errorf("create audit logger: %w", err)
		}
	}

	// 4. Init saved query store & migration store.
	querySvc, err := savedquery.NewStore(metaDB)
	if err != nil {
		metaDB.Close()
		return nil, fmt.Errorf("create saved query store: %w", err)
	}

	migrationSvc, err := migration.NewStore(metaDB)
	if err != nil {
		metaDB.Close()
		return nil, fmt.Errorf("create migration history store: %w", err)
	}

	// 5. Build ServeMux and register all API routes.
	mux := http.NewServeMux()

	// Health check endpoint.
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"OK"}`))
	})

	apiSrv := api.NewServer(store, enc, authSvc, auditLog, querySvc, migrationSvc, authEnabled)
	apiSrv.RegisterRoutes(mux)

	return &Instance{
		Mux:         mux,
		DataDir:     dataDir,
		MetaDB:      metaDB,
		AuthEnabled: authEnabled,
	}, nil
}

func loadOrGenerateJWTSecret(dataDir string) ([]byte, error) {
	if envVal := os.Getenv("PEBBLEBASE_JWT_SECRET"); envVal != "" {
		secret, err := base64.StdEncoding.DecodeString(envVal)
		if err != nil {
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

	secret := make([]byte, 32)
	if _, err := strings.NewReader("pebblebase-jwt-auto-secret-salt-").Read(secret); err != nil {
		return []byte("pebblebase-dev-jwt-secret-32byte"), nil
	}

	encoded := base64.StdEncoding.EncodeToString(secret)
	if err := os.WriteFile(secretPath, []byte(encoded), 0600); err != nil {
		log.Printf("warning: could not persist JWT secret: %v", err)
	}
	return secret, nil
}
