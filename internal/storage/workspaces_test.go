package storage

import (
	"os"
	"testing"
)

func TestWorkspaceMigrationAndMembership(t *testing.T) {
	enc, err := NewEncryptor(make([]byte, 32))
	if err != nil {
		t.Fatal(err)
	}
	store, err := NewStore(t.TempDir(), enc)
	if err != nil {
		t.Fatal(err)
	}
	first, err := store.Save("one", "postgres", "h", "1", "u", "d", "unused", false)
	if err != nil {
		t.Fatal(err)
	}
	document, err := store.Workspaces()
	if err != nil || len(document.Workspaces) != 1 || document.Workspaces[0].ConnectionIDs[0] != first.ID {
		t.Fatal(document, err)
	}
	document.Workspaces = append(document.Workspaces, Workspace{ID: "other", Name: "Other", Colour: "#ffffff", ConnectionIDs: []string{first.ID}})
	if err = store.SaveWorkspaces(document); err != nil {
		t.Fatal(err)
	}
	second, err := store.Save("two", "postgres", "h", "1", "u", "d", "unused", false)
	if err != nil {
		t.Fatal(err)
	}
	if err = store.AddConnectionToWorkspace(second.ID, "other"); err != nil {
		t.Fatal(err)
	}
	document, err = store.Workspaces()
	if err != nil || len(document.Workspaces[0].ConnectionIDs) != 1 || len(document.Workspaces[1].ConnectionIDs) != 2 {
		t.Fatal(document, err)
	}
	if err = store.SaveWorkspaces(WorkspaceDocument{Version: 1}); err == nil {
		t.Fatal("deleted last workspace")
	}
	document.Workspaces = document.Workspaces[1:]
	if err = store.SaveWorkspaces(document); err != nil {
		t.Fatal(err)
	}
	if err = store.AddConnectionToWorkspace(second.ID, "all"); err != nil {
		t.Fatal(err)
	}
	document, err = store.Workspaces()
	if err != nil || len(document.Workspaces) != 2 || document.Workspaces[1].ID != "default" {
		t.Fatal(document, err)
	}
	info, err := os.Stat(store.workspacePath())
	if err != nil || info.Mode().Perm() != 0600 {
		t.Fatal("workspace file permissions", err)
	}
}
func TestWorkspaceValidationAndCorruptConfig(t *testing.T) {
	store, err := NewStore(t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if err = store.SaveWorkspaces(WorkspaceDocument{Version: 1, Workspaces: []Workspace{{ID: "all", Name: "Invalid", Colour: "#ffffff"}}}); err == nil {
		t.Fatal("reserved id")
	}
	if err = os.WriteFile(store.workspacePath(), []byte("invalid"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err = store.Workspaces(); err == nil {
		t.Fatal("corrupt config silently replaced")
	}
}
