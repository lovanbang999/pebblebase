package main

import (
	"os"
	"testing"
)

func TestWindowState_DefaultAndClamp(t *testing.T) {
	def := DefaultWindowState()
	if def.Width != 1366 || def.Height != 850 {
		t.Fatalf("expected default 1366x850, got %dx%d", def.Width, def.Height)
	}
	if !def.IsMaximized {
		t.Fatal("expected default to be maximized")
	}

	// Test boundary clamping
	underMin := WindowState{
		X:           -100,
		Y:           -200,
		Width:       500,
		Height:      300,
		IsMaximized: false,
	}
	underMin.Clamp()

	if underMin.Width != minWindowWidth {
		t.Fatalf("expected clamped width %d, got %d", minWindowWidth, underMin.Width)
	}
	if underMin.Height != minWindowHeight {
		t.Fatalf("expected clamped height %d, got %d", minWindowHeight, underMin.Height)
	}
	if underMin.X != -1 || underMin.Y != -1 {
		t.Fatalf("expected off-screen coordinates to reset to -1, got (%d, %d)", underMin.X, underMin.Y)
	}
}

func TestWindowState_PersistenceRoundTrip(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "pebblebase_window_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// 1. Initial load with no file returns default
	initial := LoadWindowState(tmpDir)
	if initial.Width != defaultWindowWidth {
		t.Fatalf("expected default width %d, got %d", defaultWindowWidth, initial.Width)
	}

	// 2. Save custom window state
	custom := WindowState{
		X:           150,
		Y:           120,
		Width:       1440,
		Height:      900,
		IsMaximized: false,
	}
	if err := SaveWindowState(tmpDir, custom); err != nil {
		t.Fatalf("failed to save window state: %v", err)
	}

	// 3. Load saved state and assert exact match
	loaded := LoadWindowState(tmpDir)
	if loaded.X != 150 || loaded.Y != 120 {
		t.Fatalf("expected pos (150, 120), got (%d, %d)", loaded.X, loaded.Y)
	}
	if loaded.Width != 1440 || loaded.Height != 900 {
		t.Fatalf("expected size 1440x900, got %dx%d", loaded.Width, loaded.Height)
	}
	if loaded.IsMaximized {
		t.Fatal("expected IsMaximized to be false")
	}

	// 4. Overwrite with maximized state
	custom.IsMaximized = true
	if err := SaveWindowState(tmpDir, custom); err != nil {
		t.Fatalf("failed to update window state: %v", err)
	}
	reloaded := LoadWindowState(tmpDir)
	if !reloaded.IsMaximized {
		t.Fatal("expected IsMaximized to be true after update")
	}
}

func TestWindowState_CorruptFileRecovery(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "pebblebase_corrupt_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	filePath := WindowStateFilePath(tmpDir)
	if err := os.WriteFile(filePath, []byte("NOT_VALID_JSON{{{"), 0644); err != nil {
		t.Fatalf("failed to write corrupted file: %v", err)
	}

	// Loading corrupt file must gracefully recover to default without crashing
	state := LoadWindowState(tmpDir)
	if state.Width != defaultWindowWidth || state.Height != defaultWindowHeight {
		t.Fatalf("expected fallback to default, got %dx%d", state.Width, state.Height)
	}
	if !state.IsMaximized {
		t.Fatal("expected fallback state to be maximized")
	}
}
