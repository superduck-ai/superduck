package main

import (
	"fmt"
	"io"
	"os"

	"chrome-native-host/internal/cliclient"
)

// runSimpleTool dispatches a tool call that just needs args + tabId, then
// prints the response (raw JSON if --json, otherwise the textual content).
func runSimpleTool(toolName, cmdLabel string, args map[string]any) error {
	if gflags.Tab == 0 {
		return fmt.Errorf("--tab <id> is required for %s", cmdLabel)
	}
	args["tabId"] = gflags.Tab
	rec := cliclient.AuditRecord{Cmd: cmdLabel}
	raw, err := cliclient.RunTool(toolName, args, clientOpts(), &rec)
	if err != nil {
		return err
	}
	fmt.Println(raw)
	return nil
}

func readStdin() (string, error) {
	b, err := io.ReadAll(os.Stdin)
	if err != nil {
		return "", err
	}
	return string(b), nil
}
