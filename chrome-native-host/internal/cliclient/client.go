// CLI ↔ native-host UDS short-connection client.
package cliclient

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"strings"
	"time"

	"chrome-native-host/internal/protocol"
	"chrome-native-host/internal/udsauth"
)

const DefaultSocketPath = "/tmp/chrome-native-host.sock"

var ErrNotConnected = errors.New("native-host not reachable")
var ErrTimeout = errors.New("native-host call timed out")
var ErrAuthFailed = errors.New("UDS authentication failed")

type ToolError struct {
	Msg string
}

func (e *ToolError) Error() string { return e.Msg }

type Options struct {
	SocketPath string
	Timeout    time.Duration
	SessionID  string
}

func defaults(o Options) Options {
	if o.SocketPath == "" {
		o.SocketPath = DefaultSocketPath
	}
	if o.Timeout == 0 {
		o.Timeout = 30 * time.Second
	}
	return o
}

func dialAndAuthenticate(opts Options, purpose string) (net.Conn, error) {
	opts = defaults(opts)

	conn, err := net.DialTimeout("unix", opts.SocketPath, dialTimeout(opts.Timeout))
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrNotConnected, err)
	}
	_ = conn.SetDeadline(time.Now().Add(opts.Timeout))

	token, err := udsauth.ReadToken()
	if err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("auth token: %w", err)
	}

	authReq := map[string]string{"type": "auth", "token": token}
	if purpose != "" {
		authReq["purpose"] = purpose
	}
	if err := protocol.SendMessage(conn, authReq); err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("send auth: %w", err)
	}

	authRaw, err := protocol.ReadMessage(conn)
	if err != nil {
		_ = conn.Close()
		var nerr net.Error
		if errors.As(err, &nerr) && nerr.Timeout() {
			return nil, ErrTimeout
		}
		return nil, fmt.Errorf("read auth response: %w", err)
	}

	var authResp struct {
		Type  string `json:"type"`
		OK    string `json:"ok"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(authRaw, &authResp); err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("parse auth response: %w", err)
	}
	if authResp.Type != "auth_response" || authResp.OK != "true" {
		_ = conn.Close()
		if authResp.Error != "" {
			return nil, fmt.Errorf("%w: %s", ErrAuthFailed, authResp.Error)
		}
		return nil, fmt.Errorf("%w: unexpected response type=%q ok=%q", ErrAuthFailed, authResp.Type, authResp.OK)
	}

	return conn, nil
}

func dialTimeout(timeout time.Duration) time.Duration {
	const maxDialTimeout = 2 * time.Second
	if timeout > 0 && timeout < maxDialTimeout {
		return timeout
	}
	return maxDialTimeout
}

// Call sends one tool_request and returns the human-readable content (or, when
// the tool produced no content, the structured payload). Plain-text consumers
// (RunTool → CallString → printGroupResult) depend on getting the text content
// here — e.g. `tab_group new` must surface "Created new tab. Tab ID: N".
// Structured-only fields for JSON consumers are exposed separately via
// RunToolJSON, which calls callBoth directly.
func Call(tool string, args map[string]any, opts Options) (any, error) {
	content, structured, err := callBoth(tool, args, opts)
	if err != nil {
		return nil, err
	}
	switch c := content.(type) {
	case nil:
		return structured, nil
	case string:
		if c == "" {
			return structured, nil
		}
		return c, nil
	default:
		return c, nil
	}
}

// callBoth sends one tool_request and returns both the text content and the
// structuredContent payload separately, so callers like RunToolJSON can expose
// structured fields (e.g. tabContext) without losing the human-readable output.
func callBoth(tool string, args map[string]any, opts Options) (any, any, error) {
	opts = defaults(opts)

	conn, err := dialAndAuthenticate(opts, "")
	if err != nil {
		return nil, nil, err
	}
	defer conn.Close()

	params := map[string]any{
		"tool":      tool,
		"args":      args,
		"client_id": "superduck-cli",
	}
	if sid := strings.TrimSpace(opts.SessionID); sid != "" {
		params["session_id"] = sid
	}
	req := map[string]any{
		"type":   "tool_request",
		"method": "execute_tool",
		"params": params,
	}
	if err := protocol.SendMessage(conn, req); err != nil {
		return nil, nil, fmt.Errorf("send: %w", err)
	}
	raw, err := protocol.ReadMessage(conn)
	if err != nil {
		// Detect timeout: check context.DeadlineExceeded, net.Error, or i/o timeout string
		var nerr net.Error
		if errors.Is(err, context.DeadlineExceeded) ||
			(errors.As(err, &nerr) && nerr.Timeout()) ||
			strings.Contains(err.Error(), "i/o timeout") {
			return nil, nil, ErrTimeout
		}
		return nil, nil, fmt.Errorf("read: %w", err)
	}

	var resp protocol.ToolResponseMsg
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, nil, fmt.Errorf("parse response: %w", err)
	}
	if resp.Error != nil {
		return nil, nil, &ToolError{Msg: contentToString(resp.Error.Content)}
	}
	if resp.Result == nil {
		return nil, nil, &ToolError{Msg: "empty response from extension"}
	}
	return resp.Result.Content, resp.Result.StructuredContent, nil
}

// Control sends one authenticated native-host control message. Control messages
// are answered by native-host itself and do not route through Chrome.
func Control(message map[string]any, opts Options) (map[string]any, error) {
	opts = defaults(opts)

	conn, err := dialAndAuthenticate(opts, "control")
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	if err := protocol.SendMessage(conn, message); err != nil {
		return nil, fmt.Errorf("send control: %w", err)
	}
	raw, err := protocol.ReadMessage(conn)
	if err != nil {
		var nerr net.Error
		if errors.Is(err, context.DeadlineExceeded) ||
			(errors.As(err, &nerr) && nerr.Timeout()) ||
			strings.Contains(err.Error(), "i/o timeout") {
			return nil, ErrTimeout
		}
		return nil, fmt.Errorf("read control response: %w", err)
	}

	var response map[string]any
	if err := json.Unmarshal(raw, &response); err != nil {
		return nil, fmt.Errorf("parse control response: %w", err)
	}
	return response, nil
}

func Health(opts Options) (map[string]any, error) {
	return Control(map[string]any{"type": "health_check"}, opts)
}

// CallString is a convenience for tools whose primary payload is a JSON string in `output`.
// Tries to extract the inner string; returns raw content on shape mismatch.
func CallString(tool string, args map[string]any, opts Options) (string, error) {
	v, err := Call(tool, args, opts)
	if err != nil {
		return "", err
	}
	return contentToString(v), nil
}

// RunTool calls tool, times the call, finishes filling rec (Cmd assumed set by caller),
// and writes one audit line. The raw response and any error are returned to the caller.
// For commands that need to enrich rec from the response (e.g. derive status/url),
// use TimedCall instead and write the audit yourself.
func RunTool(tool string, args map[string]any, opts Options, rec *AuditRecord) (string, error) {
	raw, err := TimedCall(tool, args, opts, rec)
	_ = WriteAudit(*rec)
	return raw, err
}

// RunToolJSON is the JSON-mode counterpart of RunTool. It returns a single
// JSON object as a string, suitable for piping into jq. Always wraps the tool
// response so callers get a stable schema regardless of whether the tool
// returns structured content or plain text.
//
//	{ "tool": "...", "ok": bool, "output": <raw value or string>, "error"?: "..." }
func RunToolJSON(tool string, args map[string]any, opts Options, rec *AuditRecord) (string, error) {
	content, structured, callErr := callBoth(tool, args, opts)
	rec.OK = callErr == nil
	if callErr != nil {
		rec.Err = callErr.Error()
	}
	_ = WriteAudit(*rec)

	envelope := map[string]any{
		"tool": tool,
		"ok":   callErr == nil,
	}
	if callErr != nil {
		envelope["error"] = callErr.Error()
	} else {
		envelope["output"] = normalizeOutput(stripTabContextText(content))
		// Promote structured fields (e.g. tabContext) to the envelope top level
		// so consumers can `jq '.tabContext.currentTabId'` without parsing the
		// human-readable output string.
		if m, ok := structured.(map[string]any); ok {
			for k, v := range m {
				if isJSONEnvelopeReservedKey(k) {
					continue
				}
				if _, exists := envelope[k]; !exists {
					envelope[k] = v
				}
			}
		}
	}
	b, mErr := json.Marshal(envelope)
	if mErr != nil {
		return "", mErr
	}
	return string(b), callErr
}

// normalizeOutput collapses the `[{type:text,text:"..."}, ...]` MCP envelope
// into a plain string when that's all there is. Structured payloads are
// passed through untouched so JSON consumers can still see schema details.
func normalizeOutput(v any) any {
	if arr, ok := v.([]any); ok {
		var b strings.Builder
		allText := true
		for _, it := range arr {
			m, mok := it.(map[string]any)
			if !mok {
				allText = false
				break
			}
			s, sok := m["text"].(string)
			if !sok {
				allText = false
				break
			}
			if b.Len() > 0 {
				b.WriteByte('\n')
			}
			b.WriteString(s)
		}
		if allText && b.Len() > 0 {
			return b.String()
		}
	}
	return v
}

// stripTabContextText removes the synthetic "Tab Context" text block that
// converter.ToMCPContent appends for human-readable-only clients. In --json
// mode that same context is already promoted to the structured `tabContext`
// envelope field, so the text copy is redundant and would otherwise pollute
// `output`, breaking `superduck --json ... | jq -r '.output'`.
//
// Only the well-known Tab Context block is dropped; any other content passes
// through untouched. The original value is returned when content is not the
// expected [{type:"text", text:"..."}, ...] shape, so non-text payloads
// (images, plain strings) are never mis-handled.
func stripTabContextText(content any) any {
	arr, ok := content.([]any)
	if !ok || len(arr) == 0 {
		return content
	}
	filtered := make([]any, 0, len(arr))
	dropped := false
	for _, it := range arr {
		m, ok := it.(map[string]any)
		if !ok {
			return content
		}
		if s, ok := m["text"].(string); ok && IsTabContextTextBlock(s) {
			dropped = true
			continue
		}
		filtered = append(filtered, it)
	}
	if !dropped {
		return content
	}
	if len(filtered) == 0 {
		return ""
	}
	return filtered
}

// IsTabContextTextBlock reports whether a text content block is the synthetic
// "Tab Context" summary that converter.ToMCPContent appends for human-readable
// clients. Exported so non-RunToolJSON code paths (e.g. screenshot/zoom in
// cmd_computer.go) strip the same noise consistently.
func IsTabContextTextBlock(s string) bool {
	trimmed := strings.TrimSpace(s)
	return strings.HasPrefix(trimmed, "Tab Context:") &&
		(strings.Contains(trimmed, "\n- Available tabs:") ||
			strings.Contains(trimmed, "\n- Executed on tabId:"))
}

func isJSONEnvelopeReservedKey(key string) bool {
	switch key {
	case "content", "error", "ok", "output", "tool":
		return true
	default:
		return false
	}
}

// TimedCall calls tool and updates rec.DurationMs/OK/Err; the caller is responsible
// for writing the audit (typically after enriching rec from the response).
func TimedCall(tool string, args map[string]any, opts Options, rec *AuditRecord) (string, error) {
	start := time.Now()
	raw, err := CallString(tool, args, opts)
	rec.DurationMs = time.Since(start).Milliseconds()
	rec.OK = err == nil
	if err != nil {
		rec.Err = err.Error()
	}
	return raw, err
}

func contentToString(v any) string {
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return t
	case []any:
		// MCP-style: [{type:"text", text:"..."}, ...]
		var b strings.Builder
		for _, it := range t {
			m, ok := it.(map[string]any)
			if !ok {
				continue
			}
			if s, ok := m["text"].(string); ok {
				if b.Len() > 0 {
					b.WriteByte('\n')
				}
				b.WriteString(s)
			}
		}
		if b.Len() > 0 {
			return b.String()
		}
	case map[string]any:
		// some tools return {output: "..."}
		if s, ok := t["output"].(string); ok {
			return s
		}
		if s, ok := t["error"].(string); ok {
			return s
		}
	}
	b, _ := json.Marshal(v)
	return string(b)
}
