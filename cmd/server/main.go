package main

import (
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"pebblebase"
	"pebblebase/internal/app"
)

func main() {
	port := envOr("PORT", "8080")
	dataDir := envOr("DATA_DIR", "./data")
	authEnabled := envOr("PEBBLEBASE_AUTH_ENABLED", "true") != "false"

	inst, err := app.Bootstrap(dataDir, authEnabled)
	if err != nil {
		log.Fatalf("bootstrap: %v", err)
	}
	defer inst.Close()

	// Embedded frontend SPA routes.
	frontendFS, err := pebblebase.FrontendFS()
	if err != nil {
		log.Printf("warning: embedded frontend not available: %v", err)
	} else {
		inst.Mux.Handle("/", spaHandler(frontendFS))
	}

	addr := ":" + port
	log.Printf("Pebblebase server starting on %s (data: %s, auth: %v)", addr, dataDir, authEnabled)
	if err := http.ListenAndServe(addr, inst.Mux); err != nil {
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
