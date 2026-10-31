package storage

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

type Workspace struct {
	ID            string   `json:"id"`
	Name          string   `json:"name"`
	Colour        string   `json:"colour"`
	ConnectionIDs []string `json:"connectionIds"`
}
type WorkspaceDocument struct {
	Version    int         `json:"version"`
	Workspaces []Workspace `json:"workspaces"`
}

var workspaceColour = regexp.MustCompile(`^#[a-fA-F0-9]{6}$`)

func (s *Store) workspacePath() string { return filepath.Join(s.DataDir(), "workspaces.json") }
func (s *Store) readWorkspaces() (WorkspaceDocument, error) {
	raw, err := os.ReadFile(s.workspacePath())
	if os.IsNotExist(err) {
		records, err := s.load()
		if err != nil {
			return WorkspaceDocument{}, err
		}
		ids := []string{}
		for _, record := range records {
			ids = append(ids, record.ID)
		}
		document := WorkspaceDocument{Version: 1, Workspaces: []Workspace{{ID: "default", Name: "Default", Colour: "#3b82f6", ConnectionIDs: ids}}}
		return document, s.persistWorkspaces(document)
	}
	if err != nil {
		return WorkspaceDocument{}, err
	}
	var document WorkspaceDocument
	if err = json.Unmarshal(raw, &document); err != nil {
		return document, err
	}
	if document.Version != 1 || len(document.Workspaces) == 0 {
		return document, errors.New("invalid workspace config")
	}
	seen := map[string]bool{}
	for i := range document.Workspaces {
		workspace := &document.Workspaces[i]
		if workspace.ID == "" || workspace.ID == "all" || seen[workspace.ID] || strings.TrimSpace(workspace.Name) == "" || !workspaceColour.MatchString(workspace.Colour) {
			return document, errors.New("invalid workspace config")
		}
		seen[workspace.ID] = true
		if workspace.ConnectionIDs == nil {
			workspace.ConnectionIDs = []string{}
		}
	}
	return document, nil
}
func (s *Store) persistWorkspaces(document WorkspaceDocument) error {
	raw, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		return err
	}
	temporary, err := os.CreateTemp(s.DataDir(), "workspaces-*.tmp")
	if err != nil {
		return err
	}
	path := temporary.Name()
	defer os.Remove(path)
	if _, err = temporary.Write(raw); err != nil {
		temporary.Close()
		return err
	}
	if err = temporary.Close(); err != nil {
		return err
	}
	return os.Rename(path, s.workspacePath())
}
func (s *Store) Workspaces() (WorkspaceDocument, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.readWorkspaces()
}
func (s *Store) SaveWorkspaces(document WorkspaceDocument) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if document.Version != 1 || len(document.Workspaces) == 0 {
		return errors.New("at least one workspace is required")
	}
	records, err := s.load()
	if err != nil {
		return err
	}
	known := map[string]bool{}
	for _, record := range records {
		known[record.ID] = true
	}
	ids := map[string]bool{}
	for i := range document.Workspaces {
		workspace := &document.Workspaces[i]
		workspace.Name = strings.TrimSpace(workspace.Name)
		if workspace.ID == "" || workspace.ID == "all" || len(workspace.ID) > 100 || ids[workspace.ID] || workspace.Name == "" || len(workspace.Name) > 100 || !workspaceColour.MatchString(workspace.Colour) {
			return errors.New("invalid workspace name, id or colour")
		}
		ids[workspace.ID] = true
		unique := map[string]bool{}
		connections := []string{}
		for _, id := range workspace.ConnectionIDs {
			if known[id] && !unique[id] {
				connections = append(connections, id)
				unique[id] = true
			}
		}
		workspace.ConnectionIDs = connections
	}
	return s.persistWorkspaces(document)
}
func (s *Store) AddConnectionToWorkspace(connectionID, workspaceID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	document, err := s.readWorkspaces()
	if err != nil {
		return err
	}
	if workspaceID == "" || workspaceID == "all" {
		workspaceID = "default"
	}
	for i := range document.Workspaces {
		if document.Workspaces[i].ID == workspaceID {
			for _, id := range document.Workspaces[i].ConnectionIDs {
				if id == connectionID {
					return nil
				}
			}
			document.Workspaces[i].ConnectionIDs = append(document.Workspaces[i].ConnectionIDs, connectionID)
			return s.persistWorkspaces(document)
		}
	}
	if workspaceID != "default" {
		return errors.New("workspace no longer exists")
	}
	document.Workspaces = append(document.Workspaces, Workspace{ID: "default", Name: "Default", Colour: "#3b82f6", ConnectionIDs: []string{connectionID}})
	return s.persistWorkspaces(document)
}
