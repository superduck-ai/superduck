package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"

	"chrome-native-host/internal/bridge"
	"chrome-native-host/internal/cliclient"
)

// cmdBatch: superduck [--tab <id>] batch --file <json> | --stdin
func cmdBatch(argv []string) error {
	fs := flag.NewFlagSet("batch", flag.ContinueOnError)
	file := fs.String("file", "", "Read batch JSON from this file")
	stdin := fs.Bool("stdin", false, "Read batch JSON from stdin")
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}
	if len(fs.Args()) > 0 || (*file == "" && !*stdin) || (*file != "" && *stdin) {
		return fmt.Errorf("usage: superduck [--tab <id>] batch --file PATH | --stdin")
	}

	var raw []byte
	switch {
	case *file != "":
		b, err := os.ReadFile(*file)
		if err != nil {
			return err
		}
		raw = b
	case *stdin:
		s, err := readStdin()
		if err != nil {
			return err
		}
		raw = []byte(s)
	}

	args, err := parseBatchArgs(raw, gflags.Tab)
	if err != nil {
		return err
	}

	rec := cliclient.AuditRecord{Cmd: "batch"}
	opts := clientOpts()
	if !gflags.TimeoutSet {
		opts.Timeout = bridge.BrowserBatchTimeout(args, opts.Timeout)
	}
	if gflags.JSON {
		out, err := cliclient.RunToolJSON("browser_batch", args, opts, &rec)
		if out != "" {
			fmt.Println(out)
		}
		return err
	}
	out, err := cliclient.RunTool("browser_batch", args, opts, &rec)
	if err != nil {
		return err
	}
	fmt.Println(out)
	return nil
}

func parseBatchArgs(raw []byte, tabID int) (map[string]any, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()

	var value any
	if err := decoder.Decode(&value); err != nil {
		if err == io.EOF {
			return nil, fmt.Errorf("batch JSON is required")
		}
		return nil, fmt.Errorf("parse batch JSON: %w", err)
	}

	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return nil, fmt.Errorf("batch JSON must contain exactly one value")
		}
		return nil, fmt.Errorf("parse batch JSON: %w", err)
	}

	var args map[string]any
	switch v := value.(type) {
	case []any:
		args = map[string]any{"actions": v}
	case map[string]any:
		args = v
	default:
		return nil, fmt.Errorf("batch JSON must be an actions array or an object with an actions array")
	}

	actions, ok := args["actions"].([]any)
	if !ok {
		return nil, fmt.Errorf("batch JSON object must contain an actions array")
	}
	if len(actions) == 0 {
		return nil, fmt.Errorf("actions array must not be empty")
	}
	if tabID != 0 {
		args["tabId"] = tabID
	}

	return args, nil
}
