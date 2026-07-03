package debugbundle

import "encoding/json"

// Session mirrors the CRX DebugSessionMeta.
type Session struct {
	DebugSessionID    string `json:"debugSessionId"`
	RuntimeSessionID  string `json:"runtimeSessionId"`
	StartedAt         string `json:"startedAt"`
	EndedAt           string `json:"endedAt,omitempty"`
	ExtensionVersion  string `json:"extensionVersion"`
	Browser           string `json:"browser,omitempty"`
	NativeHostVersion string `json:"nativeHostVersion,omitempty"`
	EventCount        int    `json:"eventCount"`
	ArtifactCount     int    `json:"artifactCount"`
}

// Artifact mirrors the CRX DebugArtifact. Content is the raw artifact payload
// (base64 PNG for screenshots, text for ax-summary, JSON for js-result) so the
// CLI can write it to artifacts/<subdir>/<id>.<ext>.
type Artifact struct {
	ID         string          `json:"id"`
	Type       string          `json:"type"`
	CreatedAt  string          `json:"createdAt"`
	MimeType   string          `json:"mimeType"`
	ByteLength int             `json:"byteLength"`
	SHA256     string          `json:"sha256"`
	Redacted   bool            `json:"redacted"`
	Data       json.RawMessage `json:"data,omitempty"`
	Content    json.RawMessage `json:"content,omitempty"`
	Truncated  bool            `json:"truncated,omitempty"`
}

// Finding mirrors the CRX DiagnosisFinding.
type Finding struct {
	ID          string          `json:"id"`
	Severity    string          `json:"severity"`
	Domain      string          `json:"domain"`
	Evidence    []string        `json:"evidence"`
	LikelyCause string          `json:"likelyCause"`
	NextFiles   []string        `json:"nextFiles"`
	Data        json.RawMessage `json:"data,omitempty"`
}

type Diagnosis struct {
	Summary  string    `json:"summary"`
	Findings []Finding `json:"findings"`
}

type RuntimeEntity struct {
	ID          string          `json:"id"`
	FirstSeenTS string          `json:"firstSeenTs"`
	LastSeenTS  string          `json:"lastSeenTs"`
	EventCount  int             `json:"eventCount"`
	Domains     []string        `json:"domains"`
	Related     json.RawMessage `json:"related,omitempty"`
	Summary     json.RawMessage `json:"summary,omitempty"`
}

type RuntimeMap struct {
	DebugSessionID      string          `json:"debugSessionId"`
	RuntimeSessionID    string          `json:"runtimeSessionId"`
	StartedAt           string          `json:"startedAt"`
	EndedAt             string          `json:"endedAt,omitempty"`
	ExtensionVersion    string          `json:"extensionVersion"`
	Browser             string          `json:"browser,omitempty"`
	NativeHostVersion   string          `json:"nativeHostVersion,omitempty"`
	Sidepanels          []RuntimeEntity `json:"sidepanels"`
	AgentRuns           []RuntimeEntity `json:"agentRuns"`
	LightningIterations []RuntimeEntity `json:"lightningIterations"`
	ToolUses            []RuntimeEntity `json:"toolUses"`
	Tabs                []RuntimeEntity `json:"tabs"`
	NativeRequests      []RuntimeEntity `json:"nativeRequests"`
	WorkflowRecordings  []RuntimeEntity `json:"workflowRecordings"`
	Artifacts           []RuntimeEntity `json:"artifacts"`
}

// Bundle mirrors the CRX DebugBundle. EventsByDomain values are raw JSON
// (one object per event) so we can stream them to .jsonl without re-parsing.
type Bundle struct {
	Session         Session                      `json:"session"`
	EventsByDomain  map[string][]json.RawMessage `json:"eventsByDomain"`
	Artifacts       []Artifact                   `json:"artifacts"`
	RuntimeMap      RuntimeMap                   `json:"runtimeMap"`
	Diagnosis       Diagnosis                    `json:"diagnosis"`
	SummaryMarkdown string                       `json:"summaryMarkdown"`
	Readme          string                       `json:"readme"`
	GeneratedAt     string                       `json:"generatedAt"`
}

// DoctorCheck is one row of the `superduck debug doctor` report.
type DoctorCheck struct {
	ID       string         `json:"id"`
	Category string         `json:"category"`
	Status   string         `json:"status"`
	Message  string         `json:"message"`
	Fix      string         `json:"fix,omitempty"`
	Details  map[string]any `json:"details,omitempty"`
}

// DoctorReport is the `superduck debug doctor --json` payload.
type DoctorReport struct {
	OK     bool          `json:"ok"`
	Checks []DoctorCheck `json:"checks"`
}
