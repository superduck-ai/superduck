package selfupdate

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestParseSemver(t *testing.T) {
	tests := []struct {
		input string
		want  semver
		err   bool
	}{
		{"0.2.5", semver{0, 2, 5}, false},
		{"1.0.0", semver{1, 0, 0}, false},
		{"v0.2.6", semver{0, 2, 6}, false},
		{"12.34.56", semver{12, 34, 56}, false},
		{"bad", semver{}, true},
		{"1.2", semver{}, true},
		{"1.2.x", semver{}, true},
		{"", semver{}, true},
	}
	for _, tt := range tests {
		got, err := parseSemver(tt.input)
		if (err != nil) != tt.err {
			t.Errorf("parseSemver(%q) error = %v, wantErr %v", tt.input, err, tt.err)
			continue
		}
		if got != tt.want {
			t.Errorf("parseSemver(%q) = %v, want %v", tt.input, got, tt.want)
		}
	}
}

func TestSemverCompare(t *testing.T) {
	tests := []struct {
		a, b string
		want int
	}{
		{"0.2.5", "0.2.5", 0},
		{"0.2.5", "0.2.6", -1},
		{"0.2.6", "0.2.5", 1},
		{"0.3.0", "0.2.9", 1},
		{"1.0.0", "0.99.99", 1},
		{"0.2.5", "1.0.0", -1},
	}
	for _, tt := range tests {
		a, _ := parseSemver(tt.a)
		b, _ := parseSemver(tt.b)
		got := a.Compare(b)
		if got != tt.want {
			t.Errorf("%s.Compare(%s) = %d, want %d", tt.a, tt.b, got, tt.want)
		}
	}
}

func TestUpdateHint(t *testing.T) {
	if h := UpdateHint("0.2.5", "0.2.6"); h == "" {
		t.Error("expected hint when newer version available")
	}
	if h := UpdateHint("0.2.6", "0.2.6"); h != "" {
		t.Errorf("expected no hint when versions equal, got %q", h)
	}
	if h := UpdateHint("0.2.7", "0.2.6"); h != "" {
		t.Errorf("expected no hint when current is newer, got %q", h)
	}
	if h := UpdateHint("bad", "0.2.6"); h != "" {
		t.Errorf("expected no hint for invalid current version, got %q", h)
	}
}

func TestReadWriteCache(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	_, err := readCache()
	if err == nil {
		t.Fatal("expected error reading missing cache")
	}

	now := time.Now().Truncate(time.Second)
	r := CheckResult{Latest: "0.2.7", CheckedAt: now}
	if err := WriteCache(r); err != nil {
		t.Fatalf("WriteCache: %v", err)
	}

	got, err := readCache()
	if err != nil {
		t.Fatalf("readCache: %v", err)
	}
	if got.Latest != "0.2.7" {
		t.Errorf("Latest = %q, want 0.2.7", got.Latest)
	}
	if got.CheckedAt.Unix() != now.Unix() {
		t.Errorf("CheckedAt = %v, want %v", got.CheckedAt, now)
	}
}

func TestNeedsRemoteCheck(t *testing.T) {
	if !needsRemoteCheck(CheckResult{}) {
		t.Error("expected needs check for zero result")
	}
	if !needsRemoteCheck(CheckResult{Latest: "0.2.5", CheckedAt: time.Now().Add(-25 * time.Hour)}) {
		t.Error("expected needs check for stale result")
	}
	if needsRemoteCheck(CheckResult{Latest: "0.2.5", CheckedAt: time.Now()}) {
		t.Error("expected no check for fresh result")
	}
}

func TestLatestVersionMock(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{
			"dist-tags": map[string]string{"latest": "0.3.0"},
		})
	}))
	defer srv.Close()

	origURL := npmRegistryURL
	defer func() { setNpmRegistryURL(origURL) }()
	setNpmRegistryURL(srv.URL)

	v, err := LatestVersion()
	if err != nil {
		t.Fatalf("LatestVersion: %v", err)
	}
	if v != "0.3.0" {
		t.Errorf("LatestVersion = %q, want 0.3.0", v)
	}
}

func TestDetectInstallMethodBinary(t *testing.T) {
	method, err := DetectInstallMethod()
	if err != nil {
		t.Fatalf("DetectInstallMethod: %v", err)
	}
	if method != InstallBinary {
		t.Errorf("expected InstallBinary for test binary, got %v", method)
	}
}

func TestDetectInstallMethodNPM(t *testing.T) {
	tmp := t.TempDir()
	npmDir := filepath.Join(tmp, "node_modules", "superduck-darwin-arm64", "bin")
	if err := os.MkdirAll(npmDir, 0o755); err != nil {
		t.Fatal(err)
	}
	fakeBin := filepath.Join(npmDir, "superduck")

	method := detectInstallMethodFromPath(fakeBin)
	if method != InstallNPM {
		t.Errorf("expected InstallNPM for path with node_modules, got %v", method)
	}

	// Also test package.json fallback
	nonNpmDir := filepath.Join(tmp, "lib", "bin")
	if err := os.MkdirAll(nonNpmDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(tmp, "lib", "package.json"), []byte(`{"name":"superduck-darwin-arm64"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	method = detectInstallMethodFromPath(filepath.Join(nonNpmDir, "superduck"))
	if method != InstallNPM {
		t.Errorf("expected InstallNPM for package.json fallback, got %v", method)
	}

	// Plain path should be binary
	plainDir := filepath.Join(tmp, "usr", "local", "bin")
	if err := os.MkdirAll(plainDir, 0o755); err != nil {
		t.Fatal(err)
	}
	method = detectInstallMethodFromPath(filepath.Join(plainDir, "superduck"))
	if method != InstallBinary {
		t.Errorf("expected InstallBinary for plain path, got %v", method)
	}
}

func TestPlatformPair(t *testing.T) {
	osName, arch, err := platformPair()
	if err != nil {
		t.Fatalf("platformPair: %v", err)
	}
	if osName == "" || arch == "" {
		t.Fatal("expected non-empty os and arch")
	}
}

func TestInstallMethodString(t *testing.T) {
	if InstallNPM.String() != "npm" {
		t.Errorf("InstallNPM.String() = %q", InstallNPM.String())
	}
	if InstallBinary.String() != "binary" {
		t.Errorf("InstallBinary.String() = %q", InstallBinary.String())
	}
}
