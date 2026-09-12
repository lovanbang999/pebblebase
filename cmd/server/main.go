package main

import (
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"pebblebase"
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

	// Embedded frontend SPA routes.
	frontendFS, err := pebblebase.FrontendFS()
	if err != nil {
		log.Printf("warning: embedded frontend not available: %v", err)
	} else {
		mux.Handle("/", spaHandler(frontendFS))
	}

	addr := ":" + port
	log.Printf("Pebblebase server starting on %s (data: %s)", addr, dataDir)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("server: %v", err)
	}
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
