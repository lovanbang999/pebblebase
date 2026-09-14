package auth

import (
	"context"
	"net/http"
	"strings"
)

type contextKey string

const claimsKey contextKey = "auth_claims"

// AuthMiddleware validates the Bearer JWT on every request.
// Unauthenticated requests receive HTTP 401.
// Pass skipPaths to allow public routes (e.g. /api/auth/login).
func AuthMiddleware(svc *Service, skipPaths []string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			for _, skip := range skipPaths {
				if strings.HasPrefix(r.URL.Path, skip) {
					next.ServeHTTP(w, r)
					return
				}
			}

			tokenStr := bearerToken(r)
			if tokenStr == "" {
				http.Error(w, `{"error":"authentication required"}`, http.StatusUnauthorized)
				return
			}
			claims, err := svc.ValidateToken(tokenStr)
			if err != nil {
				http.Error(w, `{"error":"invalid or expired token"}`, http.StatusUnauthorized)
				return
			}
			ctx := context.WithValue(r.Context(), claimsKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// ClaimsFromContext extracts Claims injected by AuthMiddleware.
// Returns nil if auth is not enabled or the context has no claims.
func ClaimsFromContext(ctx context.Context) *Claims {
	c, _ := ctx.Value(claimsKey).(*Claims)
	return c
}

// RequireAdmin returns HTTP 403 when the caller is not an admin.
func RequireAdmin(w http.ResponseWriter, r *http.Request) bool {
	claims := ClaimsFromContext(r.Context())
	if claims == nil || claims.Role != RoleAdmin {
		http.Error(w, `{"error":"admin role required"}`, http.StatusForbidden)
		return false
	}
	return true
}

// IsViewer reports whether the current caller has viewer-only access.
func IsViewer(r *http.Request) bool {
	claims := ClaimsFromContext(r.Context())
	return claims != nil && claims.Role == RoleViewer
}

// bearerToken extracts the token string from "Authorization: Bearer <token>".
func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return ""
	}
	return strings.TrimPrefix(h, "Bearer ")
}
