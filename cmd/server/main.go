package main

import (
	"context"
	"errors"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

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
	server := &http.Server{Addr: addr, Handler: inst.Mux}
	stop, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	go func() {
		<-stop.Done()
		_ = inst.APIServer.Close()
		ctx, done := context.WithTimeout(context.Background(), 10*time.Second)
		defer done()
		_ = server.Shutdown(ctx)
	}()
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Printf("server stopped unexpectedly")
	}
}

// spaHandler serves embedded static assets or falls back to index.html for SPA routing.
func spaHandler(frontendFS fs.FS) http.Handler {
	fileServer := http.FileServer(http.FS(frontendFS))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Security Headers
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "SAMEORIGIN")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")

		// Path Traversal Guard: Reject path traversal payloads (e.g. ../, null bytes, backslashes)
		rawPath := r.URL.Path
		if strings.Contains(rawPath, "..") || strings.Contains(rawPath, "\x00") || strings.Contains(rawPath, "\\") {
			http.Error(w, "invalid path traversal sequence", http.StatusBadRequest)
			return
		}

		cleanPath := strings.TrimPrefix(filepath.Clean(rawPath), "/")
		if strings.HasPrefix(cleanPath, "../") || cleanPath == ".." {
			http.Error(w, "invalid path", http.StatusBadRequest)
			return
		}

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
