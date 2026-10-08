package api

import (
	"os"
	"path/filepath"
	"testing"
)

func TestValidateSQLitePath(t *testing.T) {
	tempDir := t.TempDir()
	internalMetaDB := filepath.Join(tempDir, "meta.db")
	legitDB := filepath.Join(t.TempDir(), "customer_data.db")

	tests := []struct {
		name    string
		path    string
		dataDir string
		wantErr bool
	}{
		{
			name:    "memory sqlite is allowed",
			path:    ":memory:",
			dataDir: tempDir,
			wantErr: false,
		},
		{
			name:    "file:memory:?cache=shared is allowed",
			path:    "file::memory:?cache=shared",
			dataDir: tempDir,
			wantErr: false,
		},
		{
			name:    "blocked explicit meta.db",
			path:    "meta.db",
			dataDir: "",
			wantErr: true,
		},
		{
			name:    "blocked case-insensitive META.DB",
			path:    "META.DB",
			dataDir: "",
			wantErr: true,
		},
		{
			name:    "blocked master key file",
			path:    "/var/data/.master.key",
			dataDir: "",
			wantErr: true,
		},
		{
			name:    "blocked jwt secret file",
			path:    ".jwt.secret",
			dataDir: "",
			wantErr: true,
		},
		{
			name:    "blocked connections json file",
			path:    "connections.json",
			dataDir: "",
			wantErr: true,
		},
		{
			name:    "blocked internal meta.db inside dataDir",
			path:    internalMetaDB,
			dataDir: tempDir,
			wantErr: true,
		},
		{
			name:    "blocked arbitrary file inside dataDir",
			path:    filepath.Join(tempDir, "other.db"),
			dataDir: tempDir,
			wantErr: true,
		},
		{
			name:    "blocked shadow file",
			path:    "/etc/shadow",
			dataDir: tempDir,
			wantErr: true,
		},
		{
			name:    "legitimate file outside dataDir allowed",
			path:    legitDB,
			dataDir: tempDir,
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateSQLitePath(tt.path, tt.dataDir)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateSQLitePath(%q, %q) error = %v, wantErr = %v", tt.path, tt.dataDir, err, tt.wantErr)
			}
		})
	}

	_ = os.Remove(internalMetaDB)
}
