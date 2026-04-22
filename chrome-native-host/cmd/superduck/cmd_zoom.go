package main

import (
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strconv"
	"time"

	"chrome-native-host/internal/cliclient"
)

// cmdZoom: `superduck zoom --tab <id> <x0> <y0> <x1> <y1> [--output PATH]`
// captures a region as an image. The native-host returns the same payload
// shape as `screenshot`, so we reuse the image-extraction / file-saving logic.
func cmdZoom(argv []string) error {
	fs := flag.NewFlagSet("zoom", flag.ContinueOnError)
	output := fs.String("output", "", "Save the captured image to this path or directory")
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}
	if gflags.Tab == 0 {
		return fmt.Errorf("--tab <id> is required for zoom")
	}
	rest := fs.Args()
	if len(rest) < 4 {
		return fmt.Errorf("usage: superduck zoom --tab <id> <x0> <y0> <x1> <y1> [--output PATH]")
	}
	region := make([]float64, 4)
	for i := 0; i < 4; i++ {
		v, err := strconv.ParseFloat(rest[i], 64)
		if err != nil {
			return fmt.Errorf("invalid region value %q: %v", rest[i], err)
		}
		region[i] = v
	}

	args := map[string]any{"action": "zoom", "tabId": gflags.Tab, "region": region}
	rec := cliclient.AuditRecord{Cmd: "zoom"}
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
		fmt.Printf("saved zoom (%s, %d bytes) to %s\n", image.MediaType, len(raw), path)
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
