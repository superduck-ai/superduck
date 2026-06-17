package main

import (
	"encoding/json"
	"testing"
)

func TestParseBatchArgsWrapsBareActionsArray(t *testing.T) {
	t.Parallel()

	args, err := parseBatchArgs([]byte(`[{"tool":"navigate","input":{"url":"https://example.com"}}]`), 123)
	if err != nil {
		t.Fatalf("parseBatchArgs() error = %v", err)
	}

	actions, ok := args["actions"].([]any)
	if !ok {
		t.Fatalf("actions has type %T, want []any", args["actions"])
	}
	if len(actions) != 1 {
		t.Fatalf("actions length = %d, want 1", len(actions))
	}
	if got, want := args["tabId"], 123; got != want {
		t.Fatalf("tabId = %v, want %d", got, want)
	}
}

func TestParseBatchArgsPreservesObjectAndInjectsTab(t *testing.T) {
	t.Parallel()

	raw := []byte(`{"actions":[{"tool":"computer","input":{"action":"screenshot"}}],"tabId":456,"metadata":{"source":"test"}}`)
	args, err := parseBatchArgs(raw, 123)
	if err != nil {
		t.Fatalf("parseBatchArgs() error = %v", err)
	}

	if got, want := args["tabId"], 123; got != want {
		t.Fatalf("tabId = %v, want injected %d", got, want)
	}
	metadata, ok := args["metadata"].(map[string]any)
	if !ok {
		t.Fatalf("metadata has type %T, want map[string]any", args["metadata"])
	}
	if got, want := metadata["source"], "test"; got != want {
		t.Fatalf("metadata.source = %v, want %q", got, want)
	}
}

func TestParseBatchArgsKeepsObjectTabWithoutGlobalTab(t *testing.T) {
	t.Parallel()

	args, err := parseBatchArgs([]byte(`{"actions":[{"tool":"read_page","input":{}}],"tabId":456}`), 0)
	if err != nil {
		t.Fatalf("parseBatchArgs() error = %v", err)
	}
	if got, want := args["tabId"], json.Number("456"); got != want {
		t.Fatalf("tabId = %v, want %v", got, want)
	}
}

func TestParseBatchArgsRejectsInvalidShape(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		raw  string
	}{
		{"scalar", `"nope"`},
		{"missing_actions", `{"tabId":123}`},
		{"non_array_actions", `{"actions":{"tool":"navigate"}}`},
		{"empty_actions", `[]`},
		{"trailing_value", `[{"tool":"navigate","input":{}}] {"actions":[]}`},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if _, err := parseBatchArgs([]byte(tc.raw), 0); err == nil {
				t.Fatal("parseBatchArgs() error = nil, want error")
			}
		})
	}
}
