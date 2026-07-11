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

	if err := validateUploadFilePaths([]string{dir}); err == nil {
		t.Fatal("expected directory path to fail")
	} else if !strings.Contains(err.Error(), "directory") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestCmdUploadFileRejectsMixedPathFlags(t *testing.T) {
	dir := t.TempDir()
	existing := filepath.Join(dir, "report.txt")
	if err := os.WriteFile(existing, []byte("ok"), 0o644); err != nil {
		t.Fatal(err)
	}

	err := cmdUploadFile([]string{"--path", existing, "--paths", existing, "--ref", "ref_1"})
	if err == nil {
		t.Fatal("expected error when both --path and --paths are provided")
	}
	if !strings.Contains(err.Error(), "not both") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestParsePathsCSV(t *testing.T) {
	dir := t.TempDir()
	withComma := filepath.Join(dir, "a,b.txt")
	if err := os.WriteFile(withComma, []byte("ok"), 0o644); err != nil {
		t.Fatal(err)
	}

	paths, err := parsePathsCSV(`"` + withComma + `"`)
	if err != nil {
		t.Fatalf("expected quoted comma path to parse: %v", err)
	}
	if len(paths) != 1 || paths[0] != withComma {
		t.Fatalf("unexpected paths: %#v", paths)
	}
}
