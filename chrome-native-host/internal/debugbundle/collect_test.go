package debugbundle

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRedactURL(t *testing.T) {
	got := RedactURL("https://example.com/path?token=1")
	if got != "https://example.com/path?[redacted-query]" {
		t.Errorf("RedactURL: got %q", got)
	}
	if got := RedactURL("not a url"); got != "not a url" {
		t.Errorf("RedactURL non-url: got %q", got)
	}
}

func TestParseBundleJSON(t *testing.T) {
	raw := `{"session":{"debugSessionId":"abc","runtimeSessionId":"rt","startedAt":"2026-06-27T12:00:00Z","extensionVersion":"0.1.0","eventCount":3,"artifactCount":1},"eventsByDomain":{"tool-runtime":[{"eventId":"e1","domain":"tool-runtime","event":"tool.request.received","level":"info","ids":{"requestId":"r1"},"schemaVersion":1,"ts":"2026-06-27T12:00:00Z","debugSessionId":"abc"}]},"artifacts":[{"id":"a1","type":"screenshot","createdAt":"2026-06-27T12:00:01Z","mimeType":"image/png","byteLength":100,"sha256":"sha256-x","redacted":true}],"runtimeMap":{"debugSessionId":"abc","runtimeSessionId":"rt","startedAt":"2026-06-27T12:00:00Z","extensionVersion":"0.1.0"},"diagnosis":{"summary":"s","findings":[{"id":"debugger_attach_failed","severity":"error","domain":"cdp","evidence":["e1"],"likelyCause":"x","nextFiles":["a.ts"]}]},"summaryMarkdown":"# Summary","readme":"readme","generatedAt":"2026-06-27T12:00:02Z"}`
	b, err := ParseBundleJSON(raw)
	if err != nil {
		t.Fatal(err)
	}
	if b.Session.DebugSessionID != "abc" {
		t.Errorf("session id: %q", b.Session.DebugSessionID)
	}
	if len(b.EventsByDomain["tool-runtime"]) != 1 {
		t.Errorf("events: %d", len(b.EventsByDomain["tool-runtime"]))
	}
	if len(b.Diagnosis.Findings) != 1 {
		t.Errorf("findings: %d", len(b.Diagnosis.Findings))
	}
	if b.Diagnosis.Findings[0].ID != "debugger_attach_failed" {
		t.Errorf("finding id: %q", b.Diagnosis.Findings[0].ID)
	}
	if b.Artifacts[0].SHA256 != "sha256-x" {
		t.Errorf("artifact sha: %q", b.Artifacts[0].SHA256)
	}
}

func TestWriteBundle(t *testing.T) {
	dir := t.TempDir()
	b := &Bundle{
		Session: Session{DebugSessionID: "abc12345", StartedAt: "2026-06-27T12:00:00Z", ExtensionVersion: "0.1.0"},
		EventsByDomain: map[string][]json.RawMessage{
			"tool-runtime": {json.RawMessage(`{"eventId":"e1","domain":"tool-runtime","event":"x","level":"info","ids":{},"schemaVersion":1,"ts":"2026-06-27T12:00:00Z","debugSessionId":"abc"}`)},
		},
		Diagnosis:       Diagnosis{Summary: "s", Findings: []Finding{{ID: "f1", Severity: "error", Domain: "cdp", LikelyCause: "x", NextFiles: []string{"a.ts"}}}},
		SummaryMarkdown: "# Summary",
		Readme:          "readme",
		GeneratedAt:     "2026-06-27T12:00:02Z",
		RuntimeMap:      RuntimeMap{DebugSessionID: "abc12345"},
		Artifacts:       []Artifact{{ID: "a1", Type: "screenshot", MimeType: "image/png", SHA256: "sha256-x", Redacted: true}},
	}
	out, err := WriteBundle(b, dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"00-readme.md", "summary.agent.md", "diagnosis.json", "runtime-map.json"} {
		if _, err := os.Stat(filepath.Join(out, name)); err != nil {
			t.Errorf("missing %s: %v", name, err)
		}
	}
	eventsPath := filepath.Join(out, "events", "tool-runtime.jsonl")
	data, err := os.ReadFile(eventsPath)
	if err != nil {
		t.Fatalf("read events: %v", err)
	}
	if !strings.Contains(string(data), `"event":"x"`) {
		t.Errorf("events content: %s", data)
	}
	artPath := filepath.Join(out, "artifacts", "metadata.json")
	if _, err := os.Stat(artPath); err != nil {
		t.Errorf("missing artifacts/metadata.json: %v", err)
	}
	if !strings.Contains(filepath.Base(out), "abc12345") {
		t.Errorf("dir name should contain session id prefix: %s", filepath.Base(out))
	}
}

func TestWriteBundleEmptyEvents(t *testing.T) {
	dir := t.TempDir()
	b := &Bundle{
		Session:         Session{DebugSessionID: "x", StartedAt: "2026-06-27T12:00:00Z"},
		EventsByDomain:  map[string][]json.RawMessage{},
		SummaryMarkdown: "# S",
		Readme:          "r",
		GeneratedAt:     "2026-06-27T12:00:02Z",
	}
	out, err := WriteBundle(b, dir)
	if err != nil {
		t.Fatal(err)
	}
	// events dir may be empty but bundle still writes
	if _, err := os.Stat(filepath.Join(out, "summary.agent.md")); err != nil {
		t.Errorf("missing summary: %v", err)
	}
}

func TestWriteBundleArtifactContent(t *testing.T) {
	dir := t.TempDir()
	b := &Bundle{
		Session:        Session{DebugSessionID: "x", StartedAt: "2026-06-27T12:00:00Z"},
		EventsByDomain: map[string][]json.RawMessage{},
		Artifacts: []Artifact{
			{ID: "shot1", Type: "screenshot", MimeType: "image/png", Content: json.RawMessage(`"iVBORw0KGgo="`)},
			{ID: "ax1", Type: "ax-summary", MimeType: "text/plain", Content: json.RawMessage(`"button OK\nlink Next"`)},
			{ID: "js1", Type: "js-result", MimeType: "application/json", Content: json.RawMessage(`{"output":"42"}`)},
		},
		SummaryMarkdown: "# S",
		Readme:          "r",
		GeneratedAt:     "2026-06-27T12:00:02Z",
	}
	out, err := WriteBundle(b, dir)
	if err != nil {
		t.Fatal(err)
	}
	shot, err := os.ReadFile(filepath.Join(out, "artifacts", "screenshots", "shot1.png"))
	if err != nil {
		t.Fatalf("screenshot file: %v", err)
	}
	if string(shot) != "iVBORw0KGgo=" {
		t.Errorf("screenshot content (should be unquoted): %q", shot)
	}
	ax, err := os.ReadFile(filepath.Join(out, "artifacts", "ax", "ax1.txt"))
	if err != nil {
		t.Fatalf("ax file: %v", err)
	}
	if !strings.Contains(string(ax), "button") {
		t.Errorf("ax content: %q", ax)
	}
	js, err := os.ReadFile(filepath.Join(out, "artifacts", "js", "js1.json"))
	if err != nil {
		t.Fatalf("js file: %v", err)
	}
	if !strings.Contains(string(js), "42") {
		t.Errorf("js content: %q", js)
	}
}
