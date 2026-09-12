package main

import (
	"log"
	"net/http"
	"os"

	"pebblebase/internal/api"
	"pebblebase/internal/storage"
)

func main() {
	port := envOr("PORT", "8080")
	dataDir := envOr("DATA_DIR", "./data")

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

	mux := http.NewServeMux()

	// Health check.
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"OK"}`))
	})

	// API routes.
	srv := api.NewServer(store, enc)
	srv.RegisterRoutes(mux)

	addr := ":" + port
	log.Printf("Pebblebase server starting on %s (data: %s)", addr, dataDir)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("server: %v", err)
	}
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
