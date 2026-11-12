package autoupdate

import (
	"os"
	"os/exec"
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

func TestInstallUserLauncherEscapesExecPath(t *testing.T) {
	dataHome := filepath.Join(t.TempDir(), "percent%path", `back\slash`)
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
	escapedTarget := strings.ReplaceAll(target, `\`, `\\\\`)
	escapedTarget = strings.ReplaceAll(escapedTarget, `%`, `%%`)
	wantExec := `Exec="` + escapedTarget + `"`
	if !strings.Contains(string(launcher), wantExec+"\n") {
		t.Fatalf("launcher Exec field = %q; want %q", launcher, wantExec)
	}
	if validator, err := exec.LookPath("desktop-file-validate"); err == nil {
		if output, err := exec.Command(validator, filepath.Join(applicationsDir, "pebblebase.desktop")).CombinedOutput(); err != nil {
			t.Fatalf("desktop-file-validate failed: %v\n%s", err, output)
		}
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

func TestInstallUserLauncherRestoresEntryWhenMarkerWriteFails(t *testing.T) {
	dataHome := t.TempDir()
	t.Setenv("XDG_DATA_HOME", dataHome)

	dataDir, target, applicationsDir, err := userInstallPaths()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, []byte("test executable"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(applicationsDir, 0755); err != nil {
		t.Fatal(err)
	}

	launcherPath := filepath.Join(applicationsDir, "pebblebase.desktop")
	const previousLauncher = "[Desktop Entry]\nName=Pebblebase\nExec=/old/pebblebase\nX-Pebblebase-Managed=per-user-update\n"
	if err := os.WriteFile(launcherPath, []byte(previousLauncher), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(dataDir, userInstallMarker), 0755); err != nil {
		t.Fatal(err)
	}

	if err := installUserLauncher(target); err == nil {
		t.Fatal("installUserLauncher() unexpectedly wrote a marker over a directory")
	}
	got, err := os.ReadFile(launcherPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != previousLauncher {
		t.Fatalf("previous launcher was not restored: %q", got)
	}
}
