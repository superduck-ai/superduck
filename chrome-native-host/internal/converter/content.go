package converter

import (
	"encoding/base64"
	"encoding/json"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// ToMCPContent converts Chrome tool response to MCP content format
func ToMCPContent(result interface{}) []mcp.Content {
	// If result is already an array, convert message content format to MCP format
	if arr, ok := result.([]interface{}); ok {
		mcpContent := []mcp.Content{}

		for _, item := range arr {
			if m, ok := item.(map[string]interface{}); ok {
				itemType, hasType := m["type"].(string)
				if !hasType {
					continue
				}

				switch itemType {
				case "text":
					if text, ok := m["text"].(string); ok {
						mcpContent = append(mcpContent, &mcp.TextContent{
							Text: text,
						})
					}

				case "image":
					// Convert Anthropic format to MCP format
					if source, hasSource := m["source"].(map[string]interface{}); hasSource {
						if dataStr, hasData := source["data"].(string); hasData {
							data, _ := base64.StdEncoding.DecodeString(dataStr)
							mimeType := "image/png"
							if mt, hasMT := source["media_type"].(string); hasMT {
								mimeType = mt
							}
							mcpContent = append(mcpContent, &mcp.ImageContent{
								Data:     data,
								MIMEType: mimeType,
							})
							continue
						}
					}
					// If already in MCP format
					if dataStr, hasData := m["data"].(string); hasData {
						data, _ := base64.StdEncoding.DecodeString(dataStr)
						mimeType := "image/png"
						if mt, ok := m["mimeType"].(string); ok {
							mimeType = mt
						}
						mcpContent = append(mcpContent, &mcp.ImageContent{
							Data:     data,
							MIMEType: mimeType,
						})
					}
				}
			}
		}

		return mcpContent
	}

	// Convert map result to MCP content
	if m, ok := result.(map[string]interface{}); ok {
		content := []mcp.Content{}

		// Add text output if present.
		if output, hasOutput := m["output"].(string); hasOutput {
			content = append(content, &mcp.TextContent{
				Text: output,
			})
		}

		// Preserve tab context in human-readable form for clients that only read content.
		if tabContext, hasTabContext := m["tabContext"].(map[string]interface{}); hasTabContext {
			tabContextText := "\n\nTab Context:"
			if executedOnTabID, ok := tabContext["executedOnTabId"]; ok {
				tabContextText += "\n- Executed on tabId: " + toString(executedOnTabID)
			}
			if availableTabs, ok := tabContext["availableTabs"].([]interface{}); ok {
				tabContextText += "\n- Available tabs:"
				for _, item := range availableTabs {
					tab, ok := item.(map[string]interface{})
					if !ok {
						continue
					}
					tabContextText += "\n  • tabId " + toString(tab["id"]) + `: "` + toString(tab["title"]) + `" (` + toString(tab["url"]) + `)`
				}
			}
			content = append(content, &mcp.TextContent{
				Text: tabContextText,
			})
		}

		// Handle screenshot response with base64Image
		if base64Image, hasImage := m["base64Image"].(string); hasImage {
			// Add image
			imageFormat := "png"
			if format, ok := m["imageFormat"].(string); ok {
				imageFormat = format
			}

			data, _ := base64.StdEncoding.DecodeString(base64Image)
			content = append(content, &mcp.ImageContent{
				Data:     data,
				MIMEType: "image/" + imageFormat,
			})

			return content
		}

		// Handle error response
		if errMsg, hasError := m["error"].(string); hasError {
			return []mcp.Content{
				&mcp.TextContent{
					Text: "Error: " + errMsg,
				},
			}
		}

		if len(content) > 0 {
			return content
		}
	}

	// Fallback: convert to JSON string
	jsonBytes, _ := json.Marshal(result)
	return []mcp.Content{
		&mcp.TextContent{
			Text: string(jsonBytes),
		},
	}
}

func toString(v interface{}) string {
	switch value := v.(type) {
	case string:
		return value
	case nil:
		return ""
	default:
		jsonBytes, err := json.Marshal(value)
		if err != nil {
			return ""
		}
		return string(jsonBytes)
	}
}
