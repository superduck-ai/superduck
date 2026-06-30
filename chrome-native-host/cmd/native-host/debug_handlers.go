package main

import (
	"bufio"
	"encoding/json"
	"log/slog"
	"os"
	"time"

	"chrome-native-host/internal/cliclient"
	"chrome-native-host/internal/debugbundle"
	"chrome-native-host/internal/debugrec"
	"chrome-native-host/internal/protocol"
)

// enrichDebugBundle injects Go-side recorder events and recent audit log lines
// into the CRX debug bundle JSON before it is forwarded to the UDS client.
func (s *Server) enrichDebugBundle(rawResponse []byte) []byte {
	if s.recorder == nil {
		return rawResponse
	}
	var toolResp protocol.ToolResponseMsg
	if err := json.Unmarshal(rawResponse, &toolResp); err != nil {
		slog.Error("enrich: unmarshal tool_response failed", "error", err)
		return rawResponse
	}
	if toolResp.Result == nil || toolResp.Result.Content == nil {
		return rawResponse
	}

	contentStr, ok := toolResp.Result.Content.(string)
	if !ok {
		return rawResponse
	}

	bundle, err := debugbundle.ParseBundleJSON(contentStr)
	if err != nil {
		slog.Error("enrich: parse bundle failed", "error", err)
		return rawResponse
	}

	s.injectGoEvents(bundle)
	s.injectAuditLog(bundle)

	newBundleJSON, err := json.Marshal(bundle)
	if err != nil {
		slog.Error("enrich: marshal bundle failed", "error", err)
		return rawResponse
	}
	toolResp.Result.Content = string(newBundleJSON)
	newResp, err := json.Marshal(toolResp)
	if err != nil {
		slog.Error("enrich: marshal response failed", "error", err)
		return rawResponse
	}
	return newResp
}

// injectGoEvents appends native-host recorder events into the bundle's
// mcp-server domain.
func (s *Server) injectGoEvents(bundle *debugbundle.Bundle) {
	goEventsJSON := s.recorder.RawJSON()
	var goEvents []json.RawMessage
	if err := json.Unmarshal(goEventsJSON, &goEvents); err != nil || len(goEvents) == 0 {
		return
	}
	if bundle.EventsByDomain == nil {
		bundle.EventsByDomain = make(map[string][]json.RawMessage)
	}
	bundle.EventsByDomain["mcp-server"] = append(bundle.EventsByDomain["mcp-server"], goEvents...)
	slog.Info("enriched bundle with native host events", "count", len(goEvents))
}

// injectAuditLog reads recent audit log lines and appends them as debug events
// in the mcp-server domain. URL query strings are redacted before bundling.
func (s *Server) injectAuditLog(bundle *debugbundle.Bundle) {
	auditLines, err := readAuditLines(200)
	if err != nil {
		slog.Warn("enrich: read audit log failed", "error", err)
		return
	}
	if len(auditLines) == 0 {
		return
	}
	if bundle.EventsByDomain == nil {
		bundle.EventsByDomain = make(map[string][]json.RawMessage)
	}
	for _, line := range auditLines {
		redactedData := redactAuditLine(line)
		auditEvent := map[string]any{
			"schemaVersion":  1,
			"eventId":        debugrec.GenID(),
			"ts":             time.Now().UTC().Format(time.RFC3339Nano),
			"debugSessionId": bundle.Session.DebugSessionID,
			"domain":         "mcp-server",
			"event":          "cli.audit_record",
			"level":          "debug",
			"data":           redactedData,
		}
		eventJSON, marshalErr := json.Marshal(auditEvent)
		if marshalErr == nil {
			bundle.EventsByDomain["mcp-server"] = append(
				bundle.EventsByDomain["mcp-server"], eventJSON)
		}
	}
	slog.Info("enriched bundle with audit log lines", "count", len(auditLines))
}

// redactAuditLine parses a raw audit JSON line and redacts URL query strings
// in known URL-carrying fields before the data enters the debug bundle.
func redactAuditLine(line string) json.RawMessage {
	var m map[string]json.RawMessage
	if err := json.Unmarshal([]byte(line), &m); err != nil {
		return json.RawMessage(line)
	}
	for _, key := range []string{"url", "href", "src", "targetUrl"} {
		raw, ok := m[key]
		if !ok || len(raw) == 0 {
			continue
		}
		var s string
		if err := json.Unmarshal(raw, &s); err != nil {
			continue
		}
		redacted := debugbundle.RedactURL(s)
		if redacted != s {
			b, _ := json.Marshal(redacted)
			m[key] = b
		}
	}
	out, err := json.Marshal(m)
	if err != nil {
		return json.RawMessage(line)
	}
	return out
}

// handleGetGoDebugEvents responds to a CRX request for native-host debug events.
// Called from handleChromeMessage (CRX-initiated, not forwarded via chromeMu).
func (s *Server) handleGetGoDebugEvents(raw []byte) {
	var req struct {
		Limit int `json:"limit"`
	}
	_ = json.Unmarshal(raw, &req)
	events := s.recorder.Events()
	if req.Limit > 0 && len(events) > req.Limit {
		events = events[len(events)-req.Limit:]
	}
	s.sendToChrome(map[string]any{
		"type":   "go_debug_events_response",
		"events": events,
		"count":  len(events),
	})
}

// handleGetAuditLog responds to a CRX request for recent audit log lines.
func (s *Server) handleGetAuditLog(raw []byte) {
	var req struct {
		Limit int `json:"limit"`
	}
	_ = json.Unmarshal(raw, &req)
	if req.Limit <= 0 {
		req.Limit = 200
	}
	lines, err := readAuditLines(req.Limit)
	if err != nil {
		s.sendToChrome(map[string]any{
			"type":  "audit_log_response",
			"error": err.Error(),
		})
		return
	}
	s.sendToChrome(map[string]any{
		"type":  "audit_log_response",
		"lines": lines,
	})
}

// readAuditLines returns the last n lines from ~/.superduck/audit.jsonl.
func readAuditLines(n int) ([]string, error) {
	path, err := cliclient.AuditPath()
	if err != nil {
		return nil, err
	}
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	defer f.Close()

	buf := make([]string, n)
	head, count := 0, 0
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 64*1024), 256*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		buf[head] = line
		head = (head + 1) % n
		if count < n {
			count++
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}

	out := make([]string, 0, count)
	start := (head - count + n) % n
	for i := 0; i < count; i++ {
		out = append(out, buf[(start+i)%n])
	}
	return out, nil
}
