package main

import (
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"

	"chrome-native-host/internal/cliclient"
)

// cmdScreenshot captures a screenshot of the target tab via the native-host
// UDS. It invokes the same `computer` tool that `superduck computer ...` uses,
// but is exposed as a top-level command for ergonomic use.
func cmdScreenshot(argv []string) error {
	fs := flag.NewFlagSet("screenshot", flag.ContinueOnError)
	output := fs.String("output", "", "Save the captured image to this path or directory (trailing / uses native-host UUID as filename)")
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}
	if gflags.Tab == 0 {
		return fmt.Errorf("--tab <id> is required for screenshot (use `superduck tabs` to find a tab id)")
	}
	args := map[string]any{"action": "screenshot", "tabId": gflags.Tab}

	rec := cliclient.AuditRecord{Cmd: "screenshot"}
	v, err := callWithRetry("computer", args, 6, 500*time.Millisecond)
	if err != nil {
		_ = cliclient.WriteAudit(rec)
		return err
	}
	rec.OK = true
	_ = cliclient.WriteAudit(rec)

	textParts, image := extractScreenshotPayload(v)

	if *output != "" {
		if image == nil {
			return fmt.Errorf("native host returned no image data: %s", textParts)
		}
		raw, derr := base64.StdEncoding.DecodeString(image.Data)
		if derr != nil {
			return fmt.Errorf("decode base64: %w", derr)
		}
		path := resolveOutputPath(*output, textParts, image.MediaType)
		if werr := os.WriteFile(path, raw, 0o644); werr != nil {
			return werr
		}
		if path != *output {
			fmt.Fprintf(os.Stderr, "note: wrote to %s (auto-named/extension-aligned)\n", path)
		}
		fmt.Printf("saved screenshot (%s, %d bytes) to %s\n", image.MediaType, len(raw), path)
		return nil
	}

	if gflags.JSON {
		obj := map[string]any{"output": textParts}
		if image != nil {
			obj["mediaType"] = image.MediaType
			obj["base64"] = image.Data
		}
		out, _ := json.Marshal(obj)
		fmt.Println(string(out))
		return nil
	}
	if textParts != "" {
		fmt.Println(textParts)
	}
	if image != nil {
		fmt.Printf("(image %s, %d bytes base64; pass --output <path> to save)\n", image.MediaType, len(image.Data))
	}
	return nil
}
