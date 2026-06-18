package main

import (
	"testing"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestRegisterToolsUsesValidSchemas(t *testing.T) {
	t.Parallel()
	if got, want := len(toolDefinitions), 20; got != want {
		t.Fatalf("toolDefinitions length = %d, want %d", got, want)
	}

	server := mcp.NewServer(&mcp.Implementation{
		Name:    "test-server",
		Version: "1.0.0",
	}, nil)

	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("registerTools panicked: %v", r)
		}
	}()

	registerTools(server, nil)
}

func TestBrowserBatchToolDefinition(t *testing.T) {
	t.Parallel()

	tool := findToolDefinition("browser_batch")
	if tool == nil {
		t.Fatal("browser_batch tool definition not found")
	}

	required, ok := tool.inputSchema["required"].([]string)
	if !ok {
		t.Fatalf("browser_batch required has type %T, want []string", tool.inputSchema["required"])
	}
	if len(required) != 1 || required[0] != "actions" {
		t.Fatalf("browser_batch required = %v, want [actions]", required)
	}

	properties, ok := tool.inputSchema["properties"].(map[string]any)
	if !ok {
		t.Fatalf("browser_batch properties has type %T, want map[string]any", tool.inputSchema["properties"])
	}
	actions, ok := properties["actions"].(map[string]any)
	if !ok {
		t.Fatalf("actions schema has type %T, want map[string]any", properties["actions"])
	}
	if got, want := actions["type"], "array"; got != want {
		t.Fatalf("actions type = %v, want %q", got, want)
	}
	if got, want := actions["minItems"], 2; got != want {
		t.Fatalf("actions minItems = %v, want %d", got, want)
	}
	if got, want := actions["maxItems"], 20; got != want {
		t.Fatalf("actions maxItems = %v, want %d", got, want)
	}

	items, ok := actions["items"].(map[string]any)
	if !ok {
		t.Fatalf("actions items has type %T, want map[string]any", actions["items"])
	}
	itemRequired, ok := items["required"].([]string)
	if !ok {
		t.Fatalf("actions item required has type %T, want []string", items["required"])
	}
	if len(itemRequired) != 2 || itemRequired[0] != "tool" || itemRequired[1] != "input" {
		t.Fatalf("actions item required = %v, want [tool input]", itemRequired)
	}
	itemProperties, ok := items["properties"].(map[string]any)
	if !ok {
		t.Fatalf("actions item properties has type %T, want map[string]any", items["properties"])
	}
	toolProperty, ok := itemProperties["tool"].(map[string]any)
	if !ok {
		t.Fatalf("actions item tool property has type %T, want map[string]any", itemProperties["tool"])
	}
	enumValues, ok := toolProperty["enum"].([]string)
	if !ok {
		t.Fatalf("actions item tool enum has type %T, want []string", toolProperty["enum"])
	}
	if !containsString(enumValues, "computer") || !containsString(enumValues, "read_page") {
		t.Fatalf("actions item tool enum = %v, want browser tool allowlist", enumValues)
	}
	if containsString(enumValues, "navigate") {
		t.Fatalf("actions item tool enum = %v, navigate must run as a separate tool", enumValues)
	}
	if _, ok := properties["tabId"]; !ok {
		t.Fatal("browser_batch tabId schema not found")
	}
	if _, ok := properties["onError"]; !ok {
		t.Fatal("browser_batch onError schema not found")
	}
}

func TestDefaultTimeoutForToolScalesBrowserBatch(t *testing.T) {
	t.Parallel()

	timeout := defaultTimeoutForTool("browser_batch", map[string]interface{}{
		"actions": []interface{}{
			map[string]interface{}{"tool": "computer"},
			map[string]interface{}{"tool": "read_page"},
		},
	})

	if want := defaultToolTimeout + 30*time.Second; timeout != want {
		t.Fatalf("defaultTimeoutForTool(browser_batch) = %v, want %v", timeout, want)
	}
	if timeout := defaultTimeoutForTool("read_page", nil); timeout != defaultToolTimeout {
		t.Fatalf("defaultTimeoutForTool(read_page) = %v, want %v", timeout, defaultToolTimeout)
	}
}

func findToolDefinition(name string) *toolDefinition {
	for i := range toolDefinitions {
		if toolDefinitions[i].name == name {
			return &toolDefinitions[i]
		}
	}
	return nil
}

func containsString(values []string, needle string) bool {
	for _, value := range values {
		if value == needle {
			return true
		}
	}
	return false
}
