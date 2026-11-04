package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"

	"pebblebase/internal/app"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	defaultWindowWidth  = 1366
	defaultWindowHeight = 850
	minWindowWidth      = 1024
	minWindowHeight     = 640
)

// WindowState holds persisted geometry and display state of the desktop application window.
type WindowState struct {
	X           int  `json:"x"`
	Y           int  `json:"y"`
	Width       int  `json:"width"`
	Height      int  `json:"height"`
	IsMaximized bool `json:"is_maximized"`
}

// DefaultWindowState returns standard fallback geometry.
func DefaultWindowState() WindowState {
	return WindowState{
		X:           -1, // -1 signals to center window on primary display
		Y:           -1,
		Width:       defaultWindowWidth,
		Height:      defaultWindowHeight,
		IsMaximized: true,
	}
}

// Clamp validates geometry against minimum bounds and resets off-screen coordinates.
func (ws *WindowState) Clamp() {
	if ws.Width < minWindowWidth {
		ws.Width = minWindowWidth
	}
	if ws.Height < minWindowHeight {
		ws.Height = minWindowHeight
	}
	// If X or Y are out of reasonable bounds (e.g., negative off-screen), reset to center
	if ws.X < -50 || ws.Y < -50 {
		ws.X = -1
		ws.Y = -1
	}
}

// WindowStateFilePath returns the path to window_state.json in dataDir.
func WindowStateFilePath(dataDir string) string {
	return filepath.Join(dataDir, "window_state.json")
}

// LoadWindowState reads the persisted window state from dataDir, or returns default.
func LoadWindowState(dataDir string) WindowState {
	def := DefaultWindowState()
	if dataDir == "" {
		return def
	}

	filePath := WindowStateFilePath(dataDir)
	data, err := os.ReadFile(filePath)
	if err != nil {
		return def
	}

	var state WindowState
	if err := json.Unmarshal(data, &state); err != nil {
		return def
	}

	state.Clamp()
	return state
}

// SaveWindowState writes window state to dataDir atomically.
func SaveWindowState(dataDir string, state WindowState) error {
	if dataDir == "" {
		return errors.New("empty dataDir")
	}

	state.Clamp()

	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}

	filePath := WindowStateFilePath(dataDir)
	tmpPath := filePath + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return err
	}

	return os.Rename(tmpPath, filePath)
}

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

// SaveCurrentWindowMetrics captures live window coordinates and size from Wails runtime and saves to disk.
func (a *App) SaveCurrentWindowMetrics(ctx context.Context) {
	if a.inst != nil && a.inst.DataDir != "" {
		x, y := runtime.WindowGetPosition(ctx)
		w, h := runtime.WindowGetSize(ctx)
		maximized := runtime.WindowIsMaximised(ctx)
		_ = SaveWindowState(a.inst.DataDir, WindowState{
			X:           x,
			Y:           y,
			Width:       w,
			Height:      h,
			IsMaximized: maximized,
		})
	}
}

// shutdown is called at application termination.
func (a *App) shutdown(ctx context.Context) {
	if a.ctx != nil {
		a.SaveCurrentWindowMetrics(a.ctx)
	}
	if a.httpServer != nil {
		a.httpServer.Shutdown(ctx)
	}
	if a.inst != nil {
		a.inst.Close()
	}
}

// GetWindowState returns the current persisted window state.
func (a *App) GetWindowState() WindowState {
	if a.inst != nil && a.inst.DataDir != "" {
		return LoadWindowState(a.inst.DataDir)
	}
	return DefaultWindowState()
}

// SaveWindowState updates the window state on disk.
func (a *App) SaveWindowState(state WindowState) error {
	if a.inst != nil && a.inst.DataDir != "" {
		return SaveWindowState(a.inst.DataDir, state)
	}
	return nil
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

// RestartApp quits the running process so the updated binary (already written
// to disk by /api/update/apply) launches fresh on the next open.
func (a *App) RestartApp() {
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

// OpenURL opens the specified URL in the user's default external web browser.
func (a *App) OpenURL(url string) {
	if a.ctx != nil {
		runtime.BrowserOpenURL(a.ctx, url)
	}
}
