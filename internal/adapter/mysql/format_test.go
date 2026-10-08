package mysql

import (
	"encoding/hex"
	"testing"
)

func TestFormatMySQLValue_Bit(t *testing.T) {
	// Simulated BIT(1) returning []byte{1}
	v1 := formatMySQLValueWithTypeName([]byte{1}, "BIT")
	if v1 != true {
		t.Fatalf("expected true, got %v (%T)", v1, v1)
	}

	// Simulated BIT(1) returning []byte{0}
	v0 := formatMySQLValueWithTypeName([]byte{0}, "BIT")
	if v0 != false {
		t.Fatalf("expected false, got %v (%T)", v0, v0)
	}
}

func TestFormatMySQLValue_UUIDBinary(t *testing.T) {
	// 16 bytes UUID
	rawUUID, _ := hex.DecodeString("30302e30307d4330302b305c302e3021")
	formatted := formatMySQLValueWithTypeName(rawUUID, "BINARY")
	expected := "30302e30-307d-4330-302b-305c302e3021"
	if formatted != expected {
		t.Fatalf("expected %q, got %v", expected, formatted)
	}
}

func TestFormatMySQLValue_Text(t *testing.T) {
	text := "Hello World!"
	formatted := formatMySQLValueWithTypeName([]byte(text), "VARCHAR")
	if formatted != text {
		t.Fatalf("expected %q, got %v", text, formatted)
	}
}

func TestFormatMySQLValue_GeneralBinary(t *testing.T) {
	bin := []byte{0x00, 0x01, 0x02, 0x03}
	formatted := formatMySQLValueWithTypeName(bin, "BLOB")
	expected := "0x00010203"
	if formatted != expected {
		t.Fatalf("expected %q, got %v", expected, formatted)
	}
}

func TestNormalizeMutationValue(t *testing.T) {
	uuidStr := "30302e30-307d-4330-302b-305c302e3021"
	normalized := normalizeMutationValue(uuidStr)
	b, ok := normalized.([]byte)
	if !ok || len(b) != 16 {
		t.Fatalf("expected 16 bytes slice, got %v", normalized)
	}

	hexStr := "0x11223344"
	normalizedHex := normalizeMutationValue(hexStr)
	bHex, okHex := normalizedHex.([]byte)
	if !okHex || len(bHex) != 4 || bHex[0] != 0x11 {
		t.Fatalf("expected 4 bytes slice, got %v", normalizedHex)
	}
}
