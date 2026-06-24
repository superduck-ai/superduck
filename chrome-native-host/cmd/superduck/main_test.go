package main

import (
	"errors"
	"testing"

	"chrome-native-host/internal/cliclient"
)

func TestExtractSubcommand(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name      string
		cmd, want string
		rest      []string
	}{
		{"tab_group/list", "tab_group", "list", []string{"list"}},
		{"tab_group/ls-alias", "tab_group", "list", []string{"ls", "--create-if-empty"}},
		{"tab_group/new", "tab_group", "new", []string{"new"}},
		{"tab_group/finalize", "tab_group", "finalize", []string{"finalize", "--deliverable", "123"}},
		{"tab_group/unknown", "tab_group", "unknown", []string{"weird"}},
		{"tab_group/empty", "tab_group", "", nil},
		{"gif/start", "gif", "start", []string{"start"}},
		{"gif/export", "gif", "export", []string{"export", "--download"}},
		{"gif/unknown", "gif", "unknown", []string{"foo"}},
		{"shortcuts/list", "shortcuts", "list", []string{"list"}},
		{"shortcuts/get", "shortcuts", "get", []string{"get", "my-shortcut"}},
		{"navigate/back", "navigate", "back", []string{"back"}},
		{"navigate/url", "navigate", "url", []string{"https://example.com"}},
		{"navigate/url-with-tab", "navigate", "url", []string{"--tab", "https://example.com"}},
		{"screenshot/empty", "screenshot", "", []string{"--output", "/tmp"}},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := extractSubcommand(tc.cmd, tc.rest)
			if got != tc.want {
				t.Errorf("extractSubcommand(%q, %v) = %q, want %q", tc.cmd, tc.rest, got, tc.want)
			}
		})
	}
}

func TestClassify(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name     string
		err      error
		wantCode int
		wantKind string
	}{
		{"nil", nil, 0, ""},
		{"not_connected", cliclient.ErrNotConnected, ExitNotConnected, "not_connected"},
		{"timeout", cliclient.ErrTimeout, ExitTimeout, "timeout"},
		{"tool_error", &cliclient.ToolError{Msg: "bad"}, ExitToolError, "tool_error"},
		{"no_args", errNoArgs, ExitUsage, "usage_error"},
		{"generic", errors.New("nope"), ExitUsage, "usage_error"},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			code, kind := classify(tc.err)
			if code != tc.wantCode || kind != tc.wantKind {
				t.Errorf("classify(%v) = (%d, %q), want (%d, %q)", tc.err, code, kind, tc.wantCode, tc.wantKind)
			}
		})
	}
}
