package debugbundle

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// ParseBundleJSON decodes the JSON string returned by superduck_debug_collect.
func ParseBundleJSON(s string) (*Bundle, error) {
	var b Bundle
	if err := json.Unmarshal([]byte(s), &b); err != nil {
		return nil, fmt.Errorf("parse bundle: %w", err)
	}
	return &b, nil
}

func defaultDebugDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".superduck", "debug"), nil
}

// WriteBundle writes the bundle to <outputDir>/<timestamp>-<sessionID>/ with
// the structure from docs/debug-capability-plan.md: 00-readme.md,
// summary.agent.md, diagnosis.json, runtime-map.json, events/<domain>.jsonl,
// artifacts/metadata.json. Returns the bundle directory path.
func WriteBundle(b *Bundle, outputDir string) (string, error) {
	if outputDir == "" {
		d, err := defaultDebugDir()
		if err != nil {
			return "", err
		}
		outputDir = d
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return "", err
	}

	ts := time.Now().UTC().Format("2006-01-02T150405Z")
	sessionID := b.Session.DebugSessionID
	if sessionID == "" {
		sessionID = "nosession"
	}
	if len(sessionID) > 8 {
		sessionID = sessionID[:8]
	}
	dir := filepath.Join(outputDir, fmt.Sprintf("%s-%s", ts, sessionID))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}

	writeFile := func(name string, data []byte) error {
		return os.WriteFile(filepath.Join(dir, name), data, 0o644)
	}
	writeJSON := func(name string, v any) error {
		data, err := json.MarshalIndent(v, "", "  ")
		if err != nil {
			return err
		}
		return writeFile(name, data)
	}

	if err := writeFile("00-readme.md", []byte(b.Readme)); err != nil {
		return "", err
	}
	if err := writeFile("summary.agent.md", []byte(b.SummaryMarkdown)); err != nil {
		return "", err
	}
	if err := writeJSON("diagnosis.json", b.Diagnosis); err != nil {
		return "", err
	}
	if err := writeJSON("runtime-map.json", b.RuntimeMap); err != nil {
		return "", err
	}

	eventsDir := filepath.Join(dir, "events")
	if err := os.MkdirAll(eventsDir, 0o755); err != nil {
		return "", err
	}
	for domain, events := range b.EventsByDomain {
		if len(events) == 0 {
			continue
		}
		fname := strings.ReplaceAll(domain, "/", "-") + ".jsonl"
		f, err := os.Create(filepath.Join(eventsDir, fname))
		if err != nil {
			return "", err
		}
		enc := json.NewEncoder(f)
		for _, e := range events {
			if err := enc.Encode(e); err != nil {
				f.Close()
				return "", fmt.Errorf("encode event in %s: %w", domain, err)
			}
		}
		f.Close()
	}

	artDir := filepath.Join(dir, "artifacts")
	if err := os.MkdirAll(artDir, 0o755); err != nil {
		return "", err
	}
	if err := writeJSON(filepath.Join("artifacts", "metadata.json"), b.Artifacts); err != nil {
		return "", err
	}
	if err := writeArtifactContents(b.Artifacts, artDir); err != nil {
		return "", err
	}

	return dir, nil
}

// artifactSubdir maps an artifact type to its on-disk subdirectory.
func artifactSubdir(t string) string {
	switch t {
	case "screenshot", "annotated-screenshot":
		return "screenshots"
	case "ax-summary", "ref-registry":
		return "ax"
	case "js-result":
		return "js"
	case "tab-snapshot":
		return "tab-state"
	case "native-status":
		return "native"
	case "text":
		return "text"
	}
	return ""
}

func artifactExt(t string) string {
	switch t {
	case "screenshot", "annotated-screenshot":
		return ".png"
	case "ax-summary", "text":
		return ".txt"
	case "js-result", "tab-snapshot", "native-status", "ref-registry":
		return ".json"
	}
	return ".bin"
}

// writeArtifactContents writes each artifact's content payload to
// artifacts/<subdir>/<id>.<ext>. Content that is a JSON string (base64 PNG)
// is decoded so the file is a real PNG, not a quoted JSON string.
func writeArtifactContents(artifacts []Artifact, artDir string) error {
	for _, a := range artifacts {
		if len(a.Content) == 0 {
			continue
		}
		subdir := artifactSubdir(a.Type)
		if subdir == "" {
			continue
		}
		sub := filepath.Join(artDir, subdir)
		if err := os.MkdirAll(sub, 0o755); err != nil {
			return err
		}
		data := a.Content
		// If content is a JSON string, unquote it so binary payloads (base64
		// screenshots are NOT base64 here — CRX stores raw base64 as a string)
		// land on disk verbatim.
		if len(data) > 0 && data[0] == '"' {
			var s string
			if err := json.Unmarshal(data, &s); err == nil {
				data = []byte(s)
			}
		}
		fname := sanitizeFilename(a.ID) + artifactExt(a.Type)
		if err := os.WriteFile(filepath.Join(sub, fname), data, 0o644); err != nil {
			return err
		}
	}
	return nil
}

func sanitizeFilename(s string) string {
	r := strings.NewReplacer("/", "-", "\\", "-", ":", "-")
	return r.Replace(s)
}

// PrintDoctor writes a human-readable doctor report.
func PrintDoctor(r *DoctorReport, w *os.File) {
	for _, c := range r.Checks {
		mark := "✓"
		if c.Status != "pass" {
			mark = "✗"
		}
		fmt.Fprintf(w, "%s %s — %s\n", mark, c.ID, c.Message)
		if c.Fix != "" {
			fmt.Fprintf(w, "    → %s\n", c.Fix)
		}
	}
	if r.OK {
		fmt.Fprintln(w, "\ndebug doctor: all checks passed")
	} else {
		fmt.Fprintln(w, "\ndebug doctor: some checks failed")
	}
}

// ManifestPaths returns the native-messaging manifest paths to probe, by OS.
func ManifestPaths(nativeHostName string) []string {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil
	}
	var paths []string
	switch runtime.GOOS {
	case "darwin":
		base := filepath.Join(home, "Library", "Application Support")
		paths = []string{
			filepath.Join(base, "Google", "Chrome", "NativeMessagingHosts", nativeHostName+".json"),
			filepath.Join(base, "Microsoft Edge", "NativeMessagingHosts", nativeHostName+".json"),
			filepath.Join(base, "BraveSoftware", "Brave-Browser", "NativeMessagingHosts", nativeHostName+".json"),
		}
	case "linux":
		paths = []string{
			filepath.Join(home, ".config", "google-chrome", "NativeMessagingHosts", nativeHostName+".json"),
			filepath.Join(home, ".config", "microsoft-edge", "NativeMessagingHosts", nativeHostName+".json"),
			filepath.Join(home, ".config", "BraveSoftware", "Brave-Browser", "NativeMessagingHosts", nativeHostName+".json"),
		}
	}
	return paths
}
