package selfupdate

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

type InstallMethod int

const (
	InstallNPM InstallMethod = iota
	InstallBinary
)

func (m InstallMethod) String() string {
	switch m {
	case InstallNPM:
		return "npm"
	case InstallBinary:
		return "binary"
	default:
		return "unknown"
	}
}

const gitHubRepo = "superduck-ai/superduck"

// maxTarballSize caps how much data we buffer in memory when downloading
// a release tarball. 500 MB is far above any realistic release artifact;
// a response that exceeds this is almost certainly a misconfigured server
// or a malicious payload.
const maxTarballSize = 500 << 20 // 500 MB

func DetectInstallMethod() (InstallMethod, error) {
	exe, err := os.Executable()
	if err != nil {
		return InstallBinary, err
	}
	resolved, err := filepath.EvalSymlinks(exe)
	if err != nil {
		resolved = exe
	}
	return detectInstallMethodFromPath(resolved), nil
}

func detectInstallMethodFromPath(resolved string) InstallMethod {
	if strings.Contains(resolved, "node_modules") {
		return InstallNPM
	}
	dir := filepath.Dir(resolved)
	pkgJSON := filepath.Join(dir, "..", "package.json")
	if data, err := os.ReadFile(pkgJSON); err == nil {
		if strings.Contains(string(data), "superduck-") {
			return InstallNPM
		}
	}
	return InstallBinary
}

func UpdateViaNPM(output io.Writer) (string, error) {
	npmPath, err := exec.LookPath("npm")
	if err != nil {
		return "", fmt.Errorf("npm not found in PATH; install npm or download the binary from GitHub")
	}
	cmd := exec.Command(npmPath, "install", "-g", "superduck-cli@latest")
	cmd.Stdout = output
	cmd.Stderr = output
	if err := cmd.Run(); err != nil {
		return "", err
	}
	latest, err := LatestVersion()
	if err != nil {
		return "", nil
	}
	return latest, nil
}

func platformPair() (string, string, error) {
	goos := runtime.GOOS
	goarch := runtime.GOARCH

	if goos != "darwin" && goos != "linux" {
		return "", "", fmt.Errorf("unsupported platform: %s", goos)
	}
	arch := goarch
	if goarch == "amd64" {
		arch = "x64"
	} else if goarch != "arm64" {
		return "", "", fmt.Errorf("unsupported architecture: %s", goarch)
	}
	return goos, arch, nil
}

func releaseURL(version, os, arch string) string {
	return fmt.Sprintf("https://github.com/%s/releases/download/cli-v%s/superduck-%s-%s.tar.gz",
		gitHubRepo, version, os, arch)
}

func checksumURL(version, os, arch string) string {
	return fmt.Sprintf("https://github.com/%s/releases/download/cli-v%s/superduck-%s-%s.tar.gz.sha256",
		gitHubRepo, version, os, arch)
}

func UpdateViaBinary(targetVersion string, output io.Writer) error {
	osName, archName, err := platformPair()
	if err != nil {
		return err
	}

	url := releaseURL(targetVersion, osName, archName)
	fmt.Fprintf(output, "Downloading %s...\n", url)

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return fmt.Errorf("download failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed: HTTP %d", resp.StatusCode)
	}

	// Read the entire tarball into memory so we can verify the checksum
	// before extracting anything. The LimitReader guards against OOM from
	// a misconfigured server or a malicious payload.
	tarData, err := io.ReadAll(io.LimitReader(resp.Body, maxTarballSize+1))
	if err != nil {
		return fmt.Errorf("failed to read download: %w", err)
	}
	if len(tarData) > maxTarballSize {
		return fmt.Errorf("download too large: exceeds %d MB limit", maxTarballSize>>20)
	}

	// Verify SHA256 checksum
	if err := verifyChecksum(client, targetVersion, osName, archName, tarData, output); err != nil {
		return fmt.Errorf("checksum verification failed: %w", err)
	}
	fmt.Fprintf(output, "  ✓ checksum verified\n")

	exe, err := os.Executable()
	if err != nil {
		return err
	}
	resolved, err := filepath.EvalSymlinks(exe)
	if err != nil {
		resolved = exe
	}
	binDir := filepath.Dir(resolved)

	gz, err := gzip.NewReader(bytes.NewReader(tarData))
	if err != nil {
		return fmt.Errorf("failed to decompress: %w", err)
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	extracted := 0
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("tar read error: %w", err)
		}

		base := filepath.Base(hdr.Name)
		if base != "superduck" && base != "chrome-native-host" {
			continue
		}
		if hdr.Typeflag != tar.TypeReg {
			continue
		}

		targetPath := filepath.Join(binDir, base)
		if err := replaceBinary(targetPath, tr); err != nil {
			return fmt.Errorf("failed to replace %s: %w", base, err)
		}
		fmt.Fprintf(output, "  ✓ %s\n", targetPath)
		extracted++
	}

	if extracted == 0 {
		return fmt.Errorf("no binaries found in tarball; expected bin/superduck")
	}
	return nil
}

// verifyChecksum downloads the .sha256 file and verifies the tarball hash.
func verifyChecksum(client *http.Client, version, osName, archName string, tarData []byte, output io.Writer) error {
	checksumFileURL := checksumURL(version, osName, archName)
	fmt.Fprintf(output, "Verifying checksum from %s...\n", checksumFileURL)

	resp, err := client.Get(checksumFileURL)
	if err != nil {
		return fmt.Errorf("failed to download checksum file: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("checksum file not available: HTTP %d", resp.StatusCode)
	}

	checksumData, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read checksum file: %w", err)
	}

	// Parse the checksum file (format: "<hash>  <filename>" or just "<hash>")
	fields := strings.Fields(string(checksumData))
	if len(fields) == 0 {
		return fmt.Errorf("checksum file is empty")
	}
	expectedHash := strings.TrimSpace(fields[0])
	if len(expectedHash) != 64 {
		return fmt.Errorf("invalid checksum format: %q", string(checksumData))
	}
	// Validate that the hash is valid hex
	if _, err := hex.DecodeString(expectedHash); err != nil {
		return fmt.Errorf("invalid checksum hex: %w", err)
	}

	// Compute SHA256 of the downloaded tarball
	hasher := sha256.New()
	hasher.Write(tarData)
	actualHash := hex.EncodeToString(hasher.Sum(nil))

	if actualHash != expectedHash {
		return fmt.Errorf("SHA256 mismatch: expected %s, got %s", expectedHash, actualHash)
	}

	return nil
}

func replaceBinary(targetPath string, content io.Reader) error {
	dir := filepath.Dir(targetPath)
	tmp, err := os.CreateTemp(dir, "superduck.update.*")
	if err != nil {
		return fmt.Errorf("cannot create temp file in %s: %w (try running with sudo)", dir, err)
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)

	if _, err := io.Copy(tmp, content); err != nil {
		tmp.Close()
		return err
	}
	tmp.Close()

	if err := os.Chmod(tmpPath, 0o755); err != nil {
		return err
	}
	return os.Rename(tmpPath, targetPath)
}
