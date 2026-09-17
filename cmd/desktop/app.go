package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"

	"pebblebase/internal/app"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct holds desktop application state and lifecycle handlers.
type App struct {
	ctx        context.Context
	inst       *app.Instance
	listener   net.Listener
	httpServer *http.Server
	serverURL  string
}

// NewApp creates a new App struct and initializes the Pebblebase instance.
func NewApp() *App {
	a := &App{}

	// 1. Determine local data directory (XDG config or fallback to ./data)
	dataDir := os.Getenv("DATA_DIR")
	if dataDir == "" {
		if configDir, err := os.UserConfigDir(); err == nil {
			dataDir = filepath.Join(configDir, "pebblebase")
		} else {
			dataDir = "./data"
		}
	}

	authEnabled := os.Getenv("PEBBLEBASE_AUTH_ENABLED") != "false"

	// 2. Bootstrap Pebblebase core instance (engines, sqlite, encryption, APIs)
	inst, err := app.Bootstrap(dataDir, authEnabled)
	if err != nil {
		log.Fatalf("error: bootstrap pebblebase desktop core: %v", err)
	}
	a.inst = inst

	return a
}

// Mux returns the HTTP handler for Wails AssetServer.
func (a *App) Mux() http.Handler {
	if a.inst != nil {
		return a.inst.Mux
	}
	return nil
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Start local loopback HTTP listener on 127.0.0.1:8080 (or dynamic if taken)
	// This ensures both Vite dev mode (localhost:5173 -> localhost:8080) and
	// external tools work seamlessly.
	ln, err := net.Listen("tcp", "127.0.0.1:8080")
	if err != nil {
		// Fallback to dynamic port if 8080 is occupied
		ln, err = net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			log.Printf("error: local listener: %v", err)
			return
		}
	}

	a.listener = ln
	a.serverURL = fmt.Sprintf("http://%s", ln.Addr().String())
	log.Printf("Pebblebase Desktop loopback API listening on %s (data: %s)", a.serverURL, a.inst.DataDir)

	a.httpServer = &http.Server{Handler: a.inst.Mux}
	go func() {
		if err := a.httpServer.Serve(ln); err != nil && err != http.ErrServerClosed {
			log.Printf("http server error: %v", err)
		}
	}()
}

// shutdown is called at application termination.
func (a *App) shutdown(ctx context.Context) {
	if a.httpServer != nil {
		a.httpServer.Shutdown(ctx)
	}
	if a.inst != nil {
		a.inst.Close()
	}
}

// GetServerURL returns the loopback URL for the frontend if needed.
func (a *App) GetServerURL() string {
	return a.serverURL
}

// Quit terminates the desktop application.
func (a *App) Quit() {
	if a.ctx != nil {
		runtime.Quit(a.ctx)
	}
}

// ToggleFullscreen toggles between fullscreen and normal window state.
func (a *App) ToggleFullscreen() {
	if a.ctx != nil {
		if runtime.WindowIsFullscreen(a.ctx) {
			runtime.WindowUnfullscreen(a.ctx)
		} else {
			runtime.WindowFullscreen(a.ctx)
		}
	}
}
