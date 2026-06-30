package debugrec

import (
	"errors"
	"testing"
	"time"
)

func TestRecorderBasic(t *testing.T) {
	r := New()
	r.SetSession("sess-abc")
	r.Record("navigate", "native.tool_request.forwarded", nil, nil, nil)
	r.Record("click", "native.tool_response.received", map[string]any{"status": "ok"}, nil, nil)

	events := r.Events()
	if len(events) != 2 {
		t.Fatalf("expected 2 events, got %d", len(events))
	}
	if events[0].Event != "native.tool_request.forwarded" {
		t.Errorf("event[0].Event = %q", events[0].Event)
	}
	if events[0].Data["tool"] != "navigate" {
		t.Errorf("event[0].Data[tool] = %v", events[0].Data["tool"])
	}
	if events[0].DebugSessionID != "sess-abc" {
		t.Errorf("event[0].DebugSessionID = %q", events[0].DebugSessionID)
	}
	if events[0].Domain != "mcp-server" {
		t.Errorf("event[0].Domain = %q", events[0].Domain)
	}
	if events[1].Data["status"] != "ok" {
		t.Errorf("event[1].Data[status] = %v", events[1].Data["status"])
	}
}

func TestRecorderRingBufferWrap(t *testing.T) {
	r := New()
	// Fill beyond capacity to verify wrap-around.
	for i := 0; i < capacity+50; i++ {
		r.Record("", "native.test", map[string]any{"i": i}, nil, nil)
	}
	events := r.Events()
	if len(events) != capacity {
		t.Fatalf("expected %d events, got %d", capacity, len(events))
	}
	// First event after wrap should be i=50 (the oldest surviving).
	first, ok := events[0].Data["i"].(int)
	if !ok || first != 50 {
		t.Errorf("first surviving event i = %v (expected 50)", events[0].Data["i"])
	}
}

func TestRecorderError(t *testing.T) {
	r := New()
	r.Record("read_page", "native.tool_response.received", nil, nil, errors.New("timeout"))
	events := r.Events()
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0].Level != "error" {
		t.Errorf("Level = %q, want error", events[0].Level)
	}
	if events[0].Error == nil || events[0].Error.Message != "timeout" {
		t.Errorf("Error = %+v", events[0].Error)
	}
}

func TestRecorderDuration(t *testing.T) {
	r := New()
	ms := int64(1234)
	r.Record("screenshot", "native.tool_response.received", nil, &ms, nil)
	events := r.Events()
	if events[0].DurationMs == nil || *events[0].DurationMs != 1234 {
		t.Errorf("DurationMs = %v", events[0].DurationMs)
	}
}

func TestRecorderRawJSON(t *testing.T) {
	r := New()
	r.Record("x", "native.test", nil, nil, nil)
	raw := r.RawJSON()
	if len(raw) == 0 || string(raw) == "[]" {
		t.Error("RawJSON should be non-empty")
	}
}

func TestRecorderReset(t *testing.T) {
	r := New()
	r.Record("x", "native.test", nil, nil, nil)
	r.Reset()
	if r.Count() != 0 {
		t.Errorf("Count after Reset = %d", r.Count())
	}
}

func TestGenIDUnique(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 1000; i++ {
		id := GenID()
		if seen[id] {
			t.Fatalf("duplicate id %q after %d iterations", id, i)
		}
		seen[id] = true
	}
}

// Keep the import of time used (compiler requires it when test file imports it).
var _ = time.Now
