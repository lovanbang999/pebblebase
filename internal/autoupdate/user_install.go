package autoupdate

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const userInstallMarker = "update-launcher-path"

func userInstallPaths() (dataDir, executable, applicationsDir string, err error) {
	dataDir = os.Getenv("XDG_DATA_HOME")
	if dataDir == "" || !filepath.IsAbs(dataDir) {
		home, homeErr := os.UserHomeDir()
		if homeErr != nil {
			return "", "", "", fmt.Errorf("resolve user home: %w", homeErr)
		}
		dataDir = filepath.Join(home, ".local", "share")
	}
	appDataDir := filepath.Join(dataDir, "pebblebase")
	return appDataDir, filepath.Join(appDataDir, "bin", "pebblebase"), filepath.Join(dataDir, "applications"), nil
}

func canWriteDirectory(dir string) error {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	probe, err := os.CreateTemp(dir, ".pebblebase-write-check-*")
	if err != nil {
		return err
	}
	name := probe.Name()
	if err := probe.Close(); err != nil {
		_ = os.Remove(name)
		return err
	}
	return os.Remove(name)
}

func userInstallAvailable() (string, error) {
	dataDir, executable, applicationsDir, err := userInstallPaths()
	if err != nil {
		return "", err
	}
	if err := canWriteDirectory(dataDir); err != nil {
		return "", fmt.Errorf("user update directory is not writable: %w", err)
	}
	if err := canWriteDirectory(filepath.Dir(executable)); err != nil {
		return "", fmt.Errorf("user binary directory is not writable: %w", err)
	}
	if err := canWriteDirectory(applicationsDir); err != nil {
		return "", fmt.Errorf("user applications directory is not writable: %w", err)
	}
	launcherPath := filepath.Join(applicationsDir, "pebblebase.desktop")
	if existing, err := os.ReadFile(launcherPath); err == nil && !strings.Contains(string(existing), "X-Pebblebase-Managed=per-user-update") {
		return "", fmt.Errorf("user launcher already exists at %s", launcherPath)
	} else if err != nil && !os.IsNotExist(err) {
		return "", fmt.Errorf("inspect user launcher: %w", err)
	}
	return executable, nil
}

func installUserLauncher(target string) error {
	dataDir, expectedTarget, applicationsDir, err := userInstallPaths()
	if err != nil {
		return err
	}
	if filepath.Clean(target) != filepath.Clean(expectedTarget) {
		return fmt.Errorf("refusing unexpected per-user update target %q", target)
	}
	if err := os.MkdirAll(applicationsDir, 0755); err != nil {
		return fmt.Errorf("create user applications directory: %w", err)
	}

	launcherPath := filepath.Join(applicationsDir, "pebblebase.desktop")
	var previousLauncher []byte
	var previousLauncherMode os.FileMode
	if existing, err := os.ReadFile(launcherPath); err == nil {
		if !strings.Contains(string(existing), "X-Pebblebase-Managed=per-user-update") {
			return fmt.Errorf("user launcher already exists at %s; leaving it unchanged", launcherPath)
		}
		info, err := os.Stat(launcherPath)
		if err != nil {
			return fmt.Errorf("inspect user launcher permissions: %w", err)
		}
		previousLauncher = existing
		previousLauncherMode = info.Mode().Perm()
	} else if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("inspect user launcher: %w", err)
	}

	execPath, err := desktopExecArg(target)
	if err != nil {
		return err
	}
	launcher := "[Desktop Entry]\nType=Application\nName=Pebblebase Studio\nComment=Modern lightweight database studio\n" +
		"Exec=" + execPath + "\nIcon=pebblebase\nTerminal=false\nCategories=Development;Database;IDE;\n" +
		"StartupWMClass=pebblebase\nX-Pebblebase-Managed=per-user-update\n"
	if err := atomicWriteFile(launcherPath, []byte(launcher), 0644); err != nil {
		return fmt.Errorf("install user desktop launcher: %w", err)
	}
	if err := atomicWriteFile(filepath.Join(dataDir, userInstallMarker), []byte(expectedTarget+"\n"), 0600); err != nil {
		var restoreErr error
		if previousLauncher != nil {
			restoreErr = atomicWriteFile(launcherPath, previousLauncher, previousLauncherMode)
		} else {
			restoreErr = os.Remove(launcherPath)
			if os.IsNotExist(restoreErr) {
				restoreErr = nil
			}
		}
		if restoreErr != nil {
			return fmt.Errorf("save user update launch path: %w; restore previous launcher failed: %v", err, restoreErr)
		}
		return fmt.Errorf("save user update launch path: %w", err)
	}
	return nil
}

func desktopExecArg(value string) (string, error) {
	if strings.ContainsAny(value, "\r\n") {
		return "", fmt.Errorf("executable path contains a newline")
	}
	value = strings.NewReplacer(
		"\\", "\\\\\\\\",
		"\"", "\\\\\"",
		"`", "\\\\`",
		"$", "\\\\$",
		"%", "%%",
	).Replace(value)
	return "\"" + value + "\"", nil
}

func atomicWriteFile(path string, contents []byte, mode os.FileMode) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".pebblebase-write-*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if err := tmp.Chmod(mode); err != nil {
		_ = tmp.Close()
		return err
	}
	if _, err := tmp.Write(contents); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpPath, path)
}

// UserInstalledExecutable returns the per-user executable selected after a
// system-installed Linux desktop app migrates itself to a writable location.
func UserInstalledExecutable() (string, error) {
	dataDir, expectedTarget, _, err := userInstallPaths()
	if err != nil {
		return "", err
	}
	marker, err := os.ReadFile(filepath.Join(dataDir, userInstallMarker))
	if err != nil {
		return "", err
	}
	if filepath.Clean(strings.TrimSpace(string(marker))) != filepath.Clean(expectedTarget) {
		return "", fmt.Errorf("invalid per-user update launcher marker")
	}
	if info, err := os.Stat(expectedTarget); err != nil {
		return "", err
	} else if info.IsDir() || info.Mode()&0111 == 0 {
		return "", fmt.Errorf("per-user update target is not executable")
	}
	return expectedTarget, nil
}
