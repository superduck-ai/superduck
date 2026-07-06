package main

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"chrome-native-host/internal/cliclient"
)

// Shared helpers used by the per-action top-level commands (left_click,
// right_click, scroll, screenshot, ...). Each of those commands talks to the
// Chrome extension over the native-host UDS and invokes the extension's
// `computer` tool with a different `action` value.

func runAction(action string, args map[string]any) error {
	if gflags.Tab == 0 {
		return fmt.Errorf("--tab <id> is required (use `superduck tabs` or `superduck group context` to find a tab id)")
	}
	args["action"] = action
	args["tabId"] = gflags.Tab
	// CLI users pass real CSS viewport coordinates (from read_page/exec
	// getBoundingClientRect or typed by hand), not coordinates read off a
	// scaled screenshot. Tell the extension's `computer` tool to treat them as
	// viewport space so it skips the screenshot→viewport remapping (which would
	// otherwise offset them when a screenshot context exists).
	args["coordinate_space"] = "viewport"
	rec := cliclient.AuditRecord{Cmd: action}
	v, err := callWithRetry("computer", args, 4, 400*time.Millisecond)
	rec.OK = err == nil
	if err != nil {
		rec.Err = err.Error()
	}
	_ = cliclient.WriteAudit(rec)
	if gflags.JSON {
		envelope := map[string]any{
			"tool":   "computer",
			"action": action,
			"ok":     err == nil,
		}
		if err != nil {
			envelope["error"] = err.Error()
		} else {
			envelope["output"] = contentString(v)
		}
		out, _ := json.Marshal(envelope)
		fmt.Println(string(out))
		return err
	}
	if err != nil {
		return err
	}
	printActionResult(action, contentString(v))
	return nil
}

func contentString(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	parts, ok := v.([]any)
	if !ok {
		b, _ := json.Marshal(v)
		return string(b)
	}
	var sb strings.Builder
	for _, p := range parts {
		m, ok := p.(map[string]any)
		if !ok {
			continue
		}
		if t, _ := m["type"].(string); t == "text" {
			if s, _ := m["text"].(string); s != "" {
				if sb.Len() > 0 {
					sb.WriteByte('\n')
				}
				sb.WriteString(s)
			}
		}
	}
	return sb.String()
}

func printActionResult(action, raw string) {
	var data map[string]any
	if jerr := json.Unmarshal([]byte(raw), &data); jerr != nil {
		fmt.Println(raw)
		return
	}
	if errStr, _ := data["error"].(string); errStr != "" {
		fmt.Fprintln(os.Stderr, "error:", errStr)
		return
	}
	if out, ok := data["output"].(string); ok && out != "" {
		fmt.Println(out)
		return
	}
	fmt.Printf("%s: ok\n", action)
}

func parseCoord(args []string) ([2]float64, []string, error) {
	if len(args) < 2 {
		return [2]float64{}, nil, fmt.Errorf("expected <x> <y>")
	}
	x, err := strconv.ParseFloat(args[0], 64)
	if err != nil {
		return [2]float64{}, nil, fmt.Errorf("invalid x: %v", err)
	}
	y, err := strconv.ParseFloat(args[1], 64)
	if err != nil {
		return [2]float64{}, nil, fmt.Errorf("invalid y: %v", err)
	}
	return [2]float64{x, y}, args[2:], nil
}

type imagePart struct {
	MediaType string
	Data      string
}

var screenshotIDRe = regexp.MustCompile(`ID:\s*([0-9a-fA-F-]{8,})`)

// resolveOutputPath decides where to write a captured image.
//   - If `output` is a directory (trailing slash or existing dir), the filename
//     becomes `<uuid-from-native-host>.<ext>` using the ID the extension
//     emitted in its `Successfully captured screenshot (...) - ID: <uuid>` text.
//   - Otherwise `output` is treated as a file path and only its extension is
//     aligned to the real media type.
func resolveOutputPath(output, textParts, mediaType string) string {
	ext := extForMediaType(mediaType)
	isDir := strings.HasSuffix(output, "/") || strings.HasSuffix(output, "\\")
	if !isDir {
		if fi, err := os.Stat(output); err == nil && fi.IsDir() {
			isDir = true
		}
	}
	if isDir {
		name := ""
		if m := screenshotIDRe.FindStringSubmatch(textParts); len(m) == 2 {
			name = m[1]
		}
		if name == "" {
			name = fmt.Sprintf("screenshot-%d", time.Now().UnixNano())
		}
		return strings.TrimRight(output, "/\\") + string(os.PathSeparator) + name + ext
	}
	return alignExtension(output, mediaType)
}

func extForMediaType(mt string) string {
	switch strings.ToLower(mt) {
	case "image/jpeg", "image/jpg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	default:
		return ""
	}
}

func alignExtension(path, mediaType string) string {
	want := extForMediaType(mediaType)
	if want == "" {
		return path
	}
	ext := ""
	if i := strings.LastIndex(path, "."); i > strings.LastIndexAny(path, "/\\") {
		ext = strings.ToLower(path[i:])
	}
	if ext == want || (want == ".jpg" && ext == ".jpeg") {
		return path
	}
	if ext == "" {
		return path + want
	}
	return path[:len(path)-len(ext)] + want
}

// extractScreenshotPayload pulls text + image parts out of the MCP-style
// content array returned by the `computer` tool (used by both `screenshot`
// and `zoom`).
func extractScreenshotPayload(v any) (string, *imagePart) {
	parts, ok := v.([]any)
	if !ok {
		if b, err := json.Marshal(v); err == nil {
			return string(b), nil
		}
		return fmt.Sprint(v), nil
	}
	var text strings.Builder
	var img *imagePart
	for _, p := range parts {
		m, ok := p.(map[string]any)
		if !ok {
			continue
		}
		switch m["type"] {
		case "text":
			if s, _ := m["text"].(string); s != "" {
				// Skip the synthetic "Tab Context" block (see cliclient.IsTabContextTextBlock);
				// for image captures it is noise already available via the
				// structured tabContext field in other code paths.
				if cliclient.IsTabContextTextBlock(s) {
					continue
				}
				if text.Len() > 0 {
					text.WriteByte('\n')
				}
				text.WriteString(s)
			}
		case "image":
			src, _ := m["source"].(map[string]any)
			if src == nil {
				continue
			}
			data, _ := src["data"].(string)
			mt, _ := src["media_type"].(string)
			if data != "" {
				img = &imagePart{MediaType: mt, Data: data}
			}
		}
	}
	return text.String(), img
}

// callWithRetry retries on transient errors:
//   - "Cannot access a chrome:// URL" — open hasn't finished, tab still serves
//     its old chrome://newtab placeholder before CDP can attach.
//   - "Detached while handling command" — a CDP session was torn down between
//     attach and the actual command (often after a previous tool re-attached).
//
// These patterns are intentionally case-insensitive and use partial matching
// to be resilient to minor error message format changes.
func callWithRetry(tool string, args map[string]any, attempts int, delay time.Duration) (any, error) {
	var lastErr error
	for i := 0; i < attempts; i++ {
		v, err := cliclient.Call(tool, args, clientOpts())
		if err == nil {
			return v, nil
		}
		lastErr = err
		var te *cliclient.ToolError
		if errors.As(err, &te) {
			msg := te.Msg
			msgLower := strings.ToLower(msg)
			// Check for transient errors that warrant retry
			isTransient := strings.Contains(msgLower, "chrome:// url") ||
				strings.Contains(msgLower, "chrome-extension:// url") ||
				strings.Contains(msgLower, "detached while handling") ||
				strings.Contains(msgLower, "target closed") ||
				strings.Contains(msgLower, "session closed")
			if isTransient {
				tracker.Capture("cli.tool.retried", map[string]any{
					"tool":    tool,
					"attempt": i + 1,
					"reason":  msg,
				})
				time.Sleep(delay)
				continue
			}
		}
		return nil, err
	}
	return nil, lastErr
}

// handleImageCapture processes image capture results from screenshot/zoom commands.
// It extracts the image data, optionally saves to file, and formats output.
func handleImageCapture(v any, output string, label string) error {
	textParts, image := extractScreenshotPayload(v)

	if output != "" {
		if image == nil {
			return fmt.Errorf("native host returned no image data: %s", textParts)
		}
		raw, err := base64.StdEncoding.DecodeString(image.Data)
		if err != nil {
			return fmt.Errorf("decode base64: %w", err)
		}
		path := resolveOutputPath(output, textParts, image.MediaType)
		if err := os.WriteFile(path, raw, 0o644); err != nil {
			return err
		}
		if path != output {
			fmt.Fprintf(os.Stderr, "note: wrote to %s (auto-named/extension-aligned)\n", path)
		}
		fmt.Printf("saved %s (%s, %d bytes) to %s\n", label, image.MediaType, len(raw), path)
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
