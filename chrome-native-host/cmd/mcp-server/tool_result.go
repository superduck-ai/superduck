package main

import (
	"chrome-native-host/internal/converter"
	"chrome-native-host/internal/protocol"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func buildCallToolResult(result any) *mcp.CallToolResult {
	callResult := &mcp.CallToolResult{
		Content: converter.ToMCPContent(result),
	}

	// Preserve native-host object results so fields like imageId and tabContext
	// remain available to MCP clients via structuredContent.
	switch r := result.(type) {
	case *protocol.ContentWrap:
		callResult.Content = converter.ToMCPContent(r.Content)
		callResult.StructuredContent = r.StructuredContent
		if structured, ok := r.StructuredContent.(map[string]interface{}); ok {
			// Defensive for non-extension callers that surface tool errors inside structuredContent.
			if errMsg, hasError := structured["error"].(string); hasError && errMsg != "" {
				callResult.IsError = true
			}
		}
	case map[string]interface{}:
		callResult.StructuredContent = r
		if errMsg, hasError := r["error"].(string); hasError && errMsg != "" {
			callResult.IsError = true
		}
	case []interface{}:
		// Arrays don't have structured content, but ensure Content is set
		if len(callResult.Content) == 0 {
			callResult.Content = converter.ToMCPContent(result)
		}
	}

	return callResult
}
