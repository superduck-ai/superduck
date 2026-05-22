package selfupdate

import (
	"archive/tar"
	"compress/gzip"
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
	return fmt.Sprintf("https://github.com/%s/releases/download/v%s/superduck-%s-%s.tar.gz",
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

	exe, err := os.Executable()
	if err != nil {
		return err
	}
	resolved, err := filepath.EvalSymlinks(exe)
	if err != nil {
		resolved = exe
	}
	binDir := filepath.Dir(resolved)

	gz, err := gzip.NewReader(resp.Body)
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
