package autoupdate

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestInstallUserLauncher(t *testing.T) {
	dataHome := t.TempDir()
	t.Setenv("XDG_DATA_HOME", dataHome)

	_, target, applicationsDir, err := userInstallPaths()
	if err != nil {
		t.Fatalf("userInstallPaths() error = %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, []byte("test executable"), 0755); err != nil {
		t.Fatal(err)
	}

	if err := installUserLauncher(target); err != nil {
		t.Fatalf("installUserLauncher() error = %v", err)
	}

	launcher, err := os.ReadFile(filepath.Join(applicationsDir, "pebblebase.desktop"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(launcher), "X-Pebblebase-Managed=per-user-update") || !strings.Contains(string(launcher), "Exec=\""+target+"\"") {
		t.Fatalf("launcher does not point to managed per-user executable:\n%s", launcher)
	}

	got, err := UserInstalledExecutable()
	if err != nil {
		t.Fatalf("UserInstalledExecutable() error = %v", err)
	}
	if got != target {
		t.Fatalf("UserInstalledExecutable() = %q; want %q", got, target)
	}
}

func TestInstallUserLauncherPreservesExistingUserEntry(t *testing.T) {
	dataHome := t.TempDir()
	t.Setenv("XDG_DATA_HOME", dataHome)

	_, target, applicationsDir, err := userInstallPaths()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(applicationsDir, 0755); err != nil {
		t.Fatal(err)
	}
	launcherPath := filepath.Join(applicationsDir, "pebblebase.desktop")
	const customEntry = "[Desktop Entry]\nName=My custom Pebblebase launcher\n"
	if err := os.WriteFile(launcherPath, []byte(customEntry), 0644); err != nil {
		t.Fatal(err)
	}

	if err := installUserLauncher(target); err == nil {
		t.Fatal("installUserLauncher() unexpectedly replaced a custom user launcher")
	}
	got, err := os.ReadFile(launcherPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != customEntry {
		t.Fatalf("custom launcher was changed: %q", got)
	}
}
