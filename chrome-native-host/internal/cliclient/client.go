// CLI ↔ native-host UDS short-connection client.
package cliclient

import (
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

// Call sends one tool_request and returns the structured result (or string content).
func Call(tool string, args map[string]any, opts Options) (any, error) {
	opts = defaults(opts)

	conn, err := net.DialTimeout("unix", opts.SocketPath, 2*time.Second)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrNotConnected, err)
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(opts.Timeout))

	// Authenticate with the native host
	token, err := udsauth.ReadToken()
	if err != nil {
		return nil, fmt.Errorf("auth token: %w", err)
	}

	authReq := map[string]string{"type": "auth", "token": token}
	if err := protocol.SendMessage(conn, authReq); err != nil {
		return nil, fmt.Errorf("send auth: %w", err)
	}

	authRaw, err := protocol.ReadMessage(conn)
	if err != nil {
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
		return nil, fmt.Errorf("parse auth response: %w", err)
	}
	if authResp.Type != "auth_response" || authResp.OK != "true" {
		if authResp.Error != "" {
			return nil, fmt.Errorf("%w: %s", ErrAuthFailed, authResp.Error)
		}
		return nil, fmt.Errorf("%w: unexpected response type=%q ok=%q", ErrAuthFailed, authResp.Type, authResp.OK)
	}

	req := map[string]any{
		"type":   "tool_request",
		"method": "execute_tool",
		"params": map[string]any{
			"tool":      tool,
			"args":      args,
			"client_id": "superduck-cli",
		},
	}
	if err := protocol.SendMessage(conn, req); err != nil {
		return nil, fmt.Errorf("send: %w", err)
	}
	raw, err := protocol.ReadMessage(conn)
	if err != nil {
		// timeout or EOF
		var nerr net.Error
		if errors.As(err, &nerr) && nerr.Timeout() {
			return nil, ErrTimeout
		}
		return nil, fmt.Errorf("read: %w", err)
	}

	var resp protocol.ToolResponseMsg
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}
	if resp.Error != nil {
		return nil, &ToolError{Msg: contentToString(resp.Error.Content)}
	}
	if resp.Result == nil {
		return nil, &ToolError{Msg: "empty response from extension"}
	}
	if resp.Result.StructuredContent != nil {
		return resp.Result.StructuredContent, nil
	}
	return resp.Result.Content, nil
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
	v, callErr := Call(tool, args, opts)
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
		envelope["output"] = normalizeOutput(v)
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
