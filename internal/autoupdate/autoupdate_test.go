package autoupdate

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestCompareSemver(t *testing.T) {
	tests := []struct {
		v1       string
		v2       string
		expected int
	}{
		{"0.2.1", "0.2.0", 1},
		{"0.2.0", "0.2.1", -1},
		{"v0.2.0", "0.2.0", 0},
		{"v1.0.0", "0.9.9", 1},
		{"1.0.0", "1.0.0-rc1", 0},
		{"0.1.9", "0.2.0", -1},
		{"0.2.0", "0.2.0", 0},
		{"v2.1.3", "v2.1.3", 0},
		{"2.2.0", "2.1.9", 1},
	}

	for _, tt := range tests {
		got := CompareSemver(tt.v1, tt.v2)
		if got != tt.expected {
			t.Errorf("CompareSemver(%q, %q) = %d; want %d", tt.v1, tt.v2, got, tt.expected)
		}
	}
}

func TestSignatureVerification(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("failed to generate ed25519 key: %v", err)
	}

	message := []byte("Pebblebase binary content for sha256 checksums")
	sig := ed25519.Sign(priv, message)

	// Test 1: Direct 64-byte signature
	if !VerifySignature(message, sig, pub) {
		t.Errorf("expected direct signature verification to pass")
	}

	// Test 2: Base64-encoded signature
	b64Sig := base64.StdEncoding.EncodeToString(sig)
	if !VerifySignature(message, []byte(b64Sig), pub) {
		t.Errorf("expected base64 signature verification to pass")
	}

	// Test 3: Minisign format signature
	minisignSigHeader := []byte{0x45, 0x64}         // "Ed"
	keyID := []byte{1, 2, 3, 4, 5, 6, 7, 8}         // 8-byte key id
	combined := append(minisignSigHeader, keyID...) // 10 bytes
	combined = append(combined, sig...)             // 74 bytes total
	minisignB64 := base64.StdEncoding.EncodeToString(combined)
	minisignFormatted := fmt.Sprintf("untrusted comment: signature from test key\n%s\ntrusted comment: timestamp:123\n%s\n",
		minisignB64,
		base64.StdEncoding.EncodeToString(sig),
	)

	if !VerifySignature(message, []byte(minisignFormatted), pub) {
		t.Errorf("expected minisign formatted signature verification to pass")
	}

	// Test 4: Tampered message
	tampered := []byte("Tampered binary payload")
	if VerifySignature(tampered, sig, pub) {
		t.Errorf("expected tampered message verification to fail")
	}

	// Test 5: Wrong public key
	pub2, _, _ := ed25519.GenerateKey(rand.Reader)
	if VerifySignature(message, sig, pub2) {
		t.Errorf("expected verification with wrong public key to fail")
	}
}

func TestCheckForUpdate(t *testing.T) {
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/repos/lovanbang999/pebblebase/releases/latest" {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(GitHubRelease{
				TagName:     "v0.3.0",
				Name:        "Release v0.3.0",
				Body:        "- Added new features\n- Security hardening",
				HTMLURL:     "https://github.com/lovanbang999/pebblebase/releases/tag/v0.3.0",
				PublishedAt: time.Now(),
				Assets: []GitHubAsset{
					{
						Name:               "pebblebase_0.3.0_linux_amd64.tar.gz",
						BrowserDownloadURL: "https://github.com/downloads/pebblebase_linux_amd64.tar.gz",
						Size:               15000000,
					},
					{
						Name:               "checksums.txt.minisig",
						BrowserDownloadURL: "https://github.com/downloads/checksums.txt.minisig",
						Size:               256,
					},
				},
			})
			return
		}
		http.NotFound(w, r)
	}))
	defer mockServer.Close()

	tempDir := t.TempDir()
	svc := NewService("0.2.0", tempDir,
		WithAPIBase(mockServer.URL),
		WithRepo("lovanbang999", "pebblebase"),
	)

	// Check when update is available
	info, err := svc.CheckForUpdate(context.Background(), true)
	if err != nil {
		t.Fatalf("CheckForUpdate failed: %v", err)
	}

	if !info.HasUpdate {
		t.Errorf("expected HasUpdate = true, got false")
	}
	if info.LatestVersion != "0.3.0" {
		t.Errorf("expected LatestVersion = 0.3.0, got %s", info.LatestVersion)
	}

	// When current version is equal or newer
	svcEqual := NewService("0.3.0", tempDir,
		WithAPIBase(mockServer.URL),
		WithRepo("lovanbang999", "pebblebase"),
	)
	infoEqual, err := svcEqual.CheckForUpdate(context.Background(), true)
	if err != nil {
		t.Fatalf("CheckForUpdate equal failed: %v", err)
	}
	if infoEqual.HasUpdate {
		t.Errorf("expected HasUpdate = false for identical version")
	}
}

func TestHandlerEndpoints(t *testing.T) {
	tempDir := t.TempDir()
	pub, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("ed25519 key gen failed: %v", err)
	}

	svc := NewService("0.2.0", tempDir, WithPublicKey(pub))
	handler := NewHandler(svc)
	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	// 1. GET /api/update/settings
	req := httptest.NewRequest(http.MethodGet, "/api/update/settings", nil)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Errorf("GET /api/update/settings status = %d; want %d", rr.Code, http.StatusOK)
	}

	// 2. POST /api/update/settings
	newSettingsPayload := `{"checkOnStartup": false, "channel": "stable"}`
	req = httptest.NewRequest(http.MethodPost, "/api/update/settings", bytes.NewBufferString(newSettingsPayload))
	rr = httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Errorf("POST /api/update/settings status = %d; want %d", rr.Code, http.StatusOK)
	}
	if svc.GetSettings().CheckOnStartup != false {
		t.Errorf("expected checkOnStartup to be false")
	}

	// 3. GET /api/update/check
	req = httptest.NewRequest(http.MethodGet, "/api/update/check?force=true", nil)
	rr = httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK && rr.Code != http.StatusBadGateway {
		t.Errorf("GET /api/update/check status = %d", rr.Code)
	}
}

func TestArchiveExtraction(t *testing.T) {
	tempDir := t.TempDir()
	binContent := []byte("#!/bin/sh\necho test binary\n")

	// 1. Test zip extraction
	zipPath := filepath.Join(tempDir, "test.zip")
	zipBuf := new(bytes.Buffer)
	zw := zip.NewWriter(zipBuf)
	f, err := zw.Create("pebblebase")
	if err != nil {
		t.Fatalf("failed to create zip entry: %v", err)
	}
	if _, err := f.Write(binContent); err != nil {
		t.Fatalf("failed to write zip entry: %v", err)
	}
	_ = zw.Close()
	_ = os.WriteFile(zipPath, zipBuf.Bytes(), 0644)

	extracted, err := extractBinaryIfArchive(zipPath, "pebblebase")
	if err != nil {
		t.Fatalf("zip extraction failed: %v", err)
	}
	extractedContent, _ := os.ReadFile(extracted)
	if !bytes.Equal(extractedContent, binContent) {
		t.Fatalf("extracted zip content mismatch")
	}

	// 2. Test tar.gz extraction
	tarPath := filepath.Join(tempDir, "test.tar.gz")
	tarBuf := new(bytes.Buffer)
	gzw := gzip.NewWriter(tarBuf)
	tw := tar.NewWriter(gzw)
	hdr := &tar.Header{
		Name: "pebblebase",
		Mode: 0755,
		Size: int64(len(binContent)),
	}
	_ = tw.WriteHeader(hdr)
	_, _ = tw.Write(binContent)
	_ = tw.Close()
	_ = gzw.Close()
	_ = os.WriteFile(tarPath, tarBuf.Bytes(), 0644)

	extractedTar, err := extractBinaryIfArchive(tarPath, "pebblebase")
	if err != nil {
		t.Fatalf("tar.gz extraction failed: %v", err)
	}
	extractedTarContent, _ := os.ReadFile(extractedTar)
	if !bytes.Equal(extractedTarContent, binContent) {
		t.Fatalf("extracted tar.gz content mismatch")
	}
}

func TestApplyUpdate_SecurityGates(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("failed to generate key: %v", err)
	}

	validBinaryPayload := []byte("#!/bin/sh\necho upgraded pebblebase\n")
	validSignature := ed25519.Sign(priv, validBinaryPayload)

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/binary":
			w.Header().Set("Content-Type", "application/octet-stream")
			_, _ = w.Write(validBinaryPayload)
		case "/binary-tampered":
			w.Header().Set("Content-Type", "application/octet-stream")
			_, _ = w.Write([]byte("#!/bin/sh\necho malicious backdoor\n"))
		case "/signature":
			w.Header().Set("Content-Type", "application/octet-stream")
			_, _ = w.Write(validSignature)
		default:
			http.NotFound(w, r)
		}
	}))
	defer ts.Close()

	targetDir := t.TempDir()
	targetBinary := filepath.Join(targetDir, "pebblebase")
	_ = os.WriteFile(targetBinary, []byte("original binary"), 0755)

	// 1. Refuse Downgrade Test
	{
		svc := NewService("2.0.0", targetDir, WithPublicKey(pub), WithHTTPClient(ts.Client()))
		info := &UpdateInfo{
			LatestVersion: "1.9.0",
			AssetURL:      "https://example.com/binary",
			SignatureURL:  "https://example.com/signature",
		}
		err := svc.ApplyUpdate(context.Background(), targetBinary, info)
		if err == nil || !strings.Contains(err.Error(), "refusing") {
			t.Fatalf("expected downgrade refusal error, got: %v", err)
		}
	}

	// 2. Refuse Insecure HTTP Test
	{
		svc := NewService("1.0.0", targetDir, WithPublicKey(pub), WithHTTPClient(ts.Client()))
		info := &UpdateInfo{
			LatestVersion: "2.0.0",
			AssetURL:      ts.URL + "/binary",
			SignatureURL:  "https://example.com/signature",
		}
		err := svc.ApplyUpdate(context.Background(), targetBinary, info)
		if err == nil || !strings.Contains(err.Error(), "HTTPS is required") {
			t.Fatalf("expected HTTPS required error, got: %v", err)
		}
	}

	// 3. Successful Update Test
	{
		svc := NewService("1.0.0", targetDir, WithPublicKey(pub), WithHTTPClient(ts.Client()), WithAllowInsecureHTTP(true))
		info := &UpdateInfo{
			LatestVersion: "2.0.0",
			AssetURL:      ts.URL + "/binary",
			SignatureURL:  ts.URL + "/signature",
		}
		err := svc.ApplyUpdate(context.Background(), targetBinary, info)
		if err != nil {
			t.Fatalf("ApplyUpdate failed: %v", err)
		}

		newContent, err := os.ReadFile(targetBinary)
		if err != nil {
			t.Fatalf("failed to read updated binary: %v", err)
		}
		if string(newContent) != string(validBinaryPayload) {
			t.Fatalf("binary content mismatch: %s", string(newContent))
		}

		fi, err := os.Stat(targetBinary)
		if err != nil {
			t.Fatalf("failed to stat binary: %v", err)
		}
		if runtime.GOOS != "windows" {
			if fi.Mode().Perm()&0111 == 0 {
				t.Fatalf("expected binary to be executable, got perm: %v", fi.Mode().Perm())
			}
		}
	}
}
