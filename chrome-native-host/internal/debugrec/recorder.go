// Package debugrec records native-host-side debug events into a ring buffer
// so they can be injected into the CRX debug bundle on collect.
//
// Events use the same DebugBaseEvent schema as the CRX so they merge cleanly
// into eventsByDomain["mcp-server"] in the exported bundle.
package debugrec

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"sync"
	"time"
)

const capacity = 500

// Event mirrors the CRX DebugBaseEvent shape for native-host-originated events.
type Event struct {
	SchemaVersion  int            `json:"schemaVersion"`
	EventID        string         `json:"eventId"`
	TS             string         `json:"ts"`
	DebugSessionID string         `json:"debugSessionId"`
	Domain         string         `json:"domain"`
	Event          string         `json:"event"`
	Level          string         `json:"level"`
	IDs            map[string]any `json:"ids,omitempty"`
	Data           map[string]any `json:"data,omitempty"`
	DurationMs     *int64         `json:"durationMs,omitempty"`
	Error          *EventError    `json:"error,omitempty"`
}

// EventError is the error sub-object in a debug event.
type EventError struct {
	Message string `json:"message"`
	Name    string `json:"name,omitempty"`
}

// Recorder accumulates events in a fixed-size ring buffer.
type Recorder struct {
	mu     sync.Mutex
	events []Event
	head   int
	count  int
	cap    int

	debugSessionID string
}

// New creates a recorder with the default ring buffer capacity.
func New() *Recorder {
	return &Recorder{
		events: make([]Event, capacity),
		cap:    capacity,
	}
}

// SetSession associates subsequent events with a debug session.
func (r *Recorder) SetSession(debugSessionID string) {
	r.mu.Lock()
	r.debugSessionID = debugSessionID
	r.mu.Unlock()
}

// Record adds an event to the ring buffer. Safe to call from any goroutine.
// tool: the MCP tool name (e.g. "navigate", "click") or "native" for internal events.
// eventType: dotted event name (e.g. "native.tool_request.forwarded").
func (r *Recorder) Record(tool, eventType string, data map[string]any, durationMs *int64, err error) {
	e := Event{
		SchemaVersion:  1,
		EventID:        GenID(),
		TS:             time.Now().UTC().Format(time.RFC3339Nano),
		DebugSessionID: r.getSession(),
		Domain:         "mcp-server",
		Event:          eventType,
		Level:          "info",
		Data:           data,
		DurationMs:     durationMs,
	}
	if err != nil {
		e.Level = "error"
		e.Error = &EventError{Message: err.Error()}
	}
	if tool != "" {
		if e.Data == nil {
			e.Data = make(map[string]any)
		}
		e.Data["tool"] = tool
	}

	r.mu.Lock()
	r.events[r.head] = e
	r.head = (r.head + 1) % r.cap
	if r.count < r.cap {
		r.count++
	}
	r.mu.Unlock()
}

// Events returns a copy of all buffered events in chronological order.
func (r *Recorder) Events() []Event {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.count == 0 {
		return nil
	}
	out := make([]Event, 0, r.count)
	start := (r.head - r.count + r.cap) % r.cap
	for i := 0; i < r.count; i++ {
		out = append(out, r.events[(start+i)%r.cap])
	}
	return out
}

// RawJSON returns events serialised as a JSON array, suitable for injecting
// into the CRX bundle's eventsByDomain map.
func (r *Recorder) RawJSON() json.RawMessage {
	events := r.Events()
	if events == nil {
		return json.RawMessage("[]")
	}
	b, err := json.Marshal(events)
	if err != nil {
		return json.RawMessage("[]")
	}
	return b
}

// Count returns the number of buffered events.
func (r *Recorder) Count() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.count
}

// Reset clears the buffer.
func (r *Recorder) Reset() {
	r.mu.Lock()
	r.count = 0
	r.head = 0
	r.mu.Unlock()
}

func (r *Recorder) getSession() string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.debugSessionID
}

// GenID returns a random hex id prefixed with "nh_".
func GenID() string {
	var b [12]byte
	_, _ = rand.Read(b[:])
	return fmt.Sprintf("nh_%x", b[:])
}
