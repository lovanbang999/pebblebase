package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSecurity_PathTraversalRejection(t *testing.T) {
	mux := setupTestServer(t)

	maliciousPaths := []struct {
		name string
		path string
	}{
		{"dot-dot-slash", "/../../etc/passwd"},
		{"nested-traversal", "/assets/../../../../etc/shadow"},
		{"encoded-dot-dot", "/%2e%2e/%2e%2e/etc/hosts"},
		{"windows-backslash", "/..\\..\\windows\\system32\\cmd.exe"},
		{"encoded-null-byte", "/index.html%00../../etc/passwd"},
		{"traversal-with-current", "/./../../var/log/syslog"},
	}

	for _, tc := range maliciousPaths {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, req)

			// Path traversal must not succeed in serving sensitive host data.
			// Safe outcomes: 400 Bad Request, 404 Not Found, 301/307 Redirect (to cleaned relative path)
			if rec.Code != http.StatusBadRequest && rec.Code != http.StatusNotFound &&
				rec.Code != http.StatusTemporaryRedirect && rec.Code != http.StatusMovedPermanently {
				t.Fatalf("path %q: expected reject or redirect status, got %d", tc.path, rec.Code)
			}

			body := rec.Body.String()
			// Must never leak host files
			if strings.Contains(body, "root:x:0:0") || strings.Contains(body, "[boot loader]") || strings.Contains(body, "localhost") {
				t.Fatalf("path traversal exploit succeeded on path %q: leaked host contents: %s", tc.path, body)
			}
		})
	}
}

func TestSecurity_ResponseHeaders(t *testing.T) {
	mux := setupTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	expectedHeaders := map[string]string{
		"X-Content-Type-Options": "nosniff",
		"X-Frame-Options":        "SAMEORIGIN",
		"Referrer-Policy":        "strict-origin-when-cross-origin",
	}

	for header, expectedVal := range expectedHeaders {
		got := rec.Header().Get(header)
		if got != expectedVal {
			t.Errorf("expected header %s: %q, got: %q", header, expectedVal, got)
		}
	}
}
