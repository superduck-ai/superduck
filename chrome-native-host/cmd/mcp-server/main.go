package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"

	"chrome-native-host/internal/analytics"
	"chrome-native-host/internal/bridge"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// defaultToolTimeout is the default timeout for tool execution when the
// MCP client doesn't specify a deadline.
const defaultToolTimeout = 30 * time.Second

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

	// Allow UDS path override via environment variable
	udsPath := os.Getenv("SUPERDUCK_UDS_PATH")
	if udsPath == "" {
		udsPath = bridge.DefaultUDSPath
	}

	slog.Info("connecting to native host", "uds_path", udsPath)
	nativeHost, err := bridge.NewWithOptions(bridge.Options{UDSPath: udsPath})
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

// createToolHandler creates a generic tool handler that forwards to native host.
// It ensures the context has a deadline (defaulting to defaultToolTimeout if not set)
// and passes it through to ExecuteTool so the bridge can enforce timeouts.
func createToolHandler(nativeHost *bridge.NativeHostBridge, toolName string) func(context.Context, *mcp.CallToolRequest, map[string]interface{}) (*mcp.CallToolResult, any, error) {
	return func(ctx context.Context, req *mcp.CallToolRequest, input map[string]interface{}) (*mcp.CallToolResult, any, error) {
		// Ensure context has a deadline so ExecuteTool never blocks indefinitely
		if _, hasDeadline := ctx.Deadline(); !hasDeadline {
			var cancel context.CancelFunc
			ctx, cancel = context.WithTimeout(ctx, defaultTimeoutForTool(toolName, input))
			defer cancel()
		}

		result, err := nativeHost.ExecuteTool(ctx, toolName, input)
		if err != nil {
			return nil, nil, fmt.Errorf("tool execution failed: %w", err)
		}

		return buildCallToolResult(result), nil, nil
	}
}

func defaultTimeoutForTool(toolName string, input map[string]interface{}) time.Duration {
	if toolName == "browser_batch" {
		return bridge.BrowserBatchTimeout(input, defaultToolTimeout)
	}
	return defaultToolTimeout
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
