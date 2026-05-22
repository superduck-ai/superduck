package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	"chrome-native-host/internal/analytics"
	"chrome-native-host/internal/bridge"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func main() {
	analytics.EnsureInstallID()

	// Setup logging
	logFile, err := os.OpenFile("/tmp/chrome-mcp-server.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to open log file: %v\n", err)
		os.Exit(1)
	}
	defer logFile.Close()

	logger := slog.New(slog.NewJSONHandler(logFile, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	}))
	slog.SetDefault(logger)

	slog.Info("MCP Server starting")

	// Connect to native host
	nativeHost, err := bridge.New()
	if err != nil {
		slog.Error("failed to create bridge", "error", err)
		os.Exit(1)
	}
	defer nativeHost.Close()

	// Create MCP server
	server := mcp.NewServer(&mcp.Implementation{
		Name:    "chrome-mcp-server",
		Version: "1.0.0",
	}, nil)

	// Register all tools
	registerTools(server, nativeHost)

	slog.Info("MCP Server registered all tools")

	// Run the server over stdin/stdout
	if err := server.Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		slog.Error("server error", "error", err)
		os.Exit(1)
	}

	slog.Info("MCP Server stopped")
}

// createToolHandler creates a generic tool handler that forwards to native host
func createToolHandler(nativeHost *bridge.NativeHostBridge, toolName string) func(context.Context, *mcp.CallToolRequest, map[string]interface{}) (*mcp.CallToolResult, any, error) {
	return func(ctx context.Context, req *mcp.CallToolRequest, input map[string]interface{}) (*mcp.CallToolResult, any, error) {
		result, err := nativeHost.ExecuteTool(toolName, input)
		if err != nil {
			return nil, nil, fmt.Errorf("tool execution failed: %w", err)
		}

		return buildCallToolResult(result), nil, nil
	}
}

// registerTools registers all available tools with the MCP server
func registerTools(server *mcp.Server, nativeHost *bridge.NativeHostBridge) {
	for _, tool := range toolDefinitions {
		mcp.AddTool(server, &mcp.Tool{
			Name:        tool.name,
			Description: tool.description,
			InputSchema: tool.inputSchema,
		}, createToolHandler(nativeHost, tool.name))
	}
}
