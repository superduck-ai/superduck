package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestValidateUploadFilePaths(t *testing.T) {
	dir := t.TempDir()
	existing := filepath.Join(dir, "report.txt")
	if err := os.WriteFile(existing, []byte("ok"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := validateUploadFilePaths([]string{existing}); err != nil {
		t.Fatalf("expected existing absolute path to pass: %v", err)
	}

	if err := validateUploadFilePaths([]string{"report.txt"}); err == nil {
		t.Fatal("expected relative path to fail")
	} else if !strings.Contains(err.Error(), "absolute") {
		t.Fatalf("unexpected error: %v", err)
	}

	missing := filepath.Join(dir, "missing.txt")
	if err := validateUploadFilePaths([]string{missing}); err == nil {
		t.Fatal("expected missing path to fail")
	} else if !strings.Contains(err.Error(), "does not exist") {
		t.Fatalf("unexpected error: %v", err)
	}
}
