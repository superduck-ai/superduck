package main

import (
	"fmt"
	"io"
	"os"

	"chrome-native-host/internal/cliclient"
)

// runSimpleTool dispatches a tool call that just needs args + tabId, then
// prints the response (raw JSON envelope if --json, otherwise textual content).
func runSimpleTool(toolName, cmdLabel string, args map[string]any) error {
	if gflags.Tab == 0 {
		return fmt.Errorf("--tab <id> is required for %s", cmdLabel)
	}
	args["tabId"] = gflags.Tab
	return runToolOutput(toolName, cmdLabel, args)
}

func runToolOutput(toolName, cmdLabel string, args map[string]any) error {
	rec := cliclient.AuditRecord{Cmd: cmdLabel}
	if gflags.JSON {
		raw, err := cliclient.RunToolJSON(toolName, args, clientOpts(), &rec)
		if raw != "" {
			fmt.Println(raw)
		}
		return err
	}
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
