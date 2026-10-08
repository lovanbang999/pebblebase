package api

import (
	"testing"
)

func TestSanitizeCSVValue(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "regular text",
			input:    "Hello World",
			expected: "Hello World",
		},
		{
			name:     "formula starting with equals",
			input:    "=cmd|' /C calc'!A0",
			expected: "'=cmd|' /C calc'!A0",
		},
		{
			name:     "formula with leading whitespace and equals",
			input:    "   =1+1",
			expected: "'   =1+1",
		},
		{
			name:     "formula starting with at sign",
			input:    "@SUM(A1:A10)",
			expected: "'@SUM(A1:A10)",
		},
		{
			name:     "formula starting with tab",
			input:    "\t=1+1",
			expected: "'\t=1+1",
		},
		{
			name:     "formula starting with minus and command",
			input:    "-2+cmd|' /C calc'!A0",
			expected: "'-2+cmd|' /C calc'!A0",
		},
		{
			name:     "valid negative integer",
			input:    "-42",
			expected: "-42",
		},
		{
			name:     "valid negative float",
			input:    "-123.456",
			expected: "-123.456",
		},
		{
			name:     "valid positive float with plus sign",
			input:    "+99.9",
			expected: "+99.9",
		},
		{
			name:     "plus sign followed by non-number",
			input:    "+cmd",
			expected: "'+cmd",
		},
		{
			name:     "empty string",
			input:    "",
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := sanitizeCSVValue(tt.input)
			if got != tt.expected {
				t.Errorf("sanitizeCSVValue(%q) = %q, want %q", tt.input, got, tt.expected)
			}
		})
	}
}

func TestFormatCSVValue(t *testing.T) {
	tests := []struct {
		name     string
		val      any
		expected string
	}{
		{
			name:     "nil value",
			val:      nil,
			expected: "",
		},
		{
			name:     "string with formula injection",
			val:      "=2+5",
			expected: "'=2+5",
		},
		{
			name:     "byte slice with formula injection",
			val:      []byte("@cmd"),
			expected: "'@cmd",
		},
		{
			name:     "normal int",
			val:      -100,
			expected: "-100",
		},
		{
			name:     "normal float",
			val:      -3.14,
			expected: "-3.14",
		},
		{
			name:     "boolean true",
			val:      true,
			expected: "true",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := formatCSVValue(tt.val)
			if got != tt.expected {
				t.Errorf("formatCSVValue(%v) = %q, want %q", tt.val, got, tt.expected)
			}
		})
	}
}
