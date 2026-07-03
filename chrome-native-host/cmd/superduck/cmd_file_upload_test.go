package main

import (
	"strings"
	"testing"
	"time"

	"chrome-native-host/internal/cliclient"
)

func TestCmdFileUploadRejectsRelativePaths(t *testing.T) {
	withCLIFlags(t, globalFlags{SocketPath: cliclient.DefaultSocketPath, Timeout: 30 * time.Second})

	err := cmdFileUpload([]string{"--ref", "ref_1", "relative.txt"})
	if err == nil {
		t.Fatal("cmdFileUpload() error = nil, want relative path error")
	}
	if !strings.Contains(err.Error(), "must be absolute") {
		t.Fatalf("cmdFileUpload() error = %q, want absolute path error", err)
	}
}
