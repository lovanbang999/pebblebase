// Package connection handles building and normalizing database connection inputs.
package connection

import (
	"fmt"
	"net/url"
	"strings"
)

// ConnectionInput is the raw user input from the UI — either form fields or a raw URL.
// It is the single entry point before any DSN is constructed.
type ConnectionInput struct {
	Type                               string // "postgres" | "mysql" | "mongodb" | "sqlite"
	Mode                               string // "form" | "url"
	Host, Port, User, Password, DBName string // used when Mode == "form"
	Filepath                           string // used when Type == "sqlite" in form mode
	RawURL                             string // used when Mode == "url", overrides form fields
	SavePassword                       bool   // "Save password" checkbox per-connection
	ReadOnly                           bool   // "Read-only" connection flag
}

// ToDSN normalizes input into a single DSN string ready for the driver.
//
// When Mode == "url", RawURL is returned as-is after a basic validation that it
// is non-empty. When Mode == "form", a DSN is constructed from the individual
// fields with sensible defaults applied.
func (c ConnectionInput) ToDSN() (string, error) {
	if c.Mode == "url" {
		if strings.TrimSpace(c.RawURL) == "" {
			return "", fmt.Errorf("connection: raw URL is empty")
		}
		return c.RawURL, nil
	}

	switch c.Type {
	case "postgres":
		return c.postgresDSN()
	case "mysql":
		return c.mysqlDSN()
	case "mongodb":
		return c.mongoDSN()
	case "sqlite":
		return c.sqliteDSN()
	default:
		return "", fmt.Errorf("connection: unsupported database type %q", c.Type)
	}
}

// postgresDSN builds a libpq-compatible connection string.
// Default port: 5432. Default sslmode: prefer.
func (c ConnectionInput) postgresDSN() (string, error) {
	if err := c.requireFields("host", "user", "database"); err != nil {
		return "", err
	}
	port := c.portOr("5432")
	u := url.URL{
		Scheme: "postgres",
		Host:   fmt.Sprintf("%s:%s", c.Host, port),
		Path:   "/" + c.DBName,
	}
	if c.User != "" || c.Password != "" {
		u.User = url.UserPassword(c.User, c.Password)
	}
	q := url.Values{"sslmode": {"prefer"}}
	u.RawQuery = q.Encode()
	return u.String(), nil
}

// mysqlDSN builds a Go mysql driver DSN (github.com/go-sql-driver/mysql format).
// Default port: 3306.
func (c ConnectionInput) mysqlDSN() (string, error) {
	if err := c.requireFields("host", "user", "database"); err != nil {
		return "", err
	}
	port := c.portOr("3306")
	// Format: user:password@tcp(host:port)/dbname?params
	creds := c.User
	if c.Password != "" {
		creds = fmt.Sprintf("%s:%s", c.User, c.Password)
	}
	return fmt.Sprintf(
		"%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=true&loc=Local",
		creds, c.Host, port, c.DBName,
	), nil
}

// mongoDSN builds a MongoDB connection URI.
// Default port: 27017. The caller can use mongodb+srv:// via RawURL mode.
func (c ConnectionInput) mongoDSN() (string, error) {
	if err := c.requireFields("host", "database"); err != nil {
		return "", err
	}
	port := c.portOr("27017")
	u := url.URL{
		Scheme: "mongodb",
		Host:   fmt.Sprintf("%s:%s", c.Host, port),
		Path:   "/" + c.DBName,
	}
	if c.User != "" || c.Password != "" {
		u.User = url.UserPassword(c.User, c.Password)
		u.RawQuery = url.Values{"authSource": {"admin"}}.Encode()
	}
	return u.String(), nil
}

// sqliteDSN builds a SQLite connection string / file path.
func (c ConnectionInput) sqliteDSN() (string, error) {
	fp := strings.TrimSpace(c.Filepath)
	if fp == "" {
		fp = strings.TrimSpace(c.DBName)
	}
	if fp == "" {
		return "", fmt.Errorf("connection: file path is required for sqlite connections")
	}
	return fp, nil
}

// requireFields returns an error if any of the named fields are empty.
func (c ConnectionInput) requireFields(fields ...string) error {
	for _, f := range fields {
		var val string
		switch f {
		case "host":
			val = c.Host
		case "user":
			val = c.User
		case "database":
			val = c.DBName
		}
		if strings.TrimSpace(val) == "" {
			return fmt.Errorf("connection: %s is required for %s connections", f, c.Type)
		}
	}
	return nil
}

// portOr returns Port if set, otherwise the provided default.
func (c ConnectionInput) portOr(def string) string {
	if strings.TrimSpace(c.Port) != "" {
		return c.Port
	}
	return def
}
