package protocol

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"sync"
)

// Chrome Native Messaging Protocol
// Messages are length-prefixed: 4 bytes (little-endian uint32) + JSON payload

var stdoutMu sync.Mutex

func ReadMessage(r io.Reader) ([]byte, error) {
	var length uint32
	if err := binary.Read(r, binary.LittleEndian, &length); err != nil {
		return nil, err
	}
	if length > 1024*1024 {
		return nil, fmt.Errorf("message too large: %d bytes", length)
	}
	buf := make([]byte, length)
	if _, err := io.ReadFull(r, buf); err != nil {
		return nil, err
	}
	return buf, nil
}

func SendMessage(w io.Writer, msg interface{}) error {
	stdoutMu.Lock()
	defer stdoutMu.Unlock()

	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	length := uint32(len(data))
	if err := binary.Write(w, binary.LittleEndian, length); err != nil {
		return err
	}
	_, err = w.Write(data)
	return err
}

// Message types for Chrome Native Host protocol

type Message struct {
	Type    string                 `json:"type"`
	Method  string                 `json:"method,omitempty"`
	Params  map[string]interface{} `json:"params,omitempty"`
	JSONRPC string                 `json:"jsonrpc,omitempty"`
}

type ToolRequest struct {
	Type   string `json:"type"`
	Method string `json:"method"`
	Params struct {
		Tool      string                 `json:"tool"`
		Args      map[string]interface{} `json:"args"`
		ClientID  string                 `json:"client_id,omitempty"`
		SessionID string                 `json:"session_id,omitempty"`
	} `json:"params"`
}

func NewToolRequest(tool string, args map[string]any, clientID string, sessionID string) Message {
	if args == nil {
		args = map[string]any{}
	}
	params := map[string]any{
		"tool": tool,
		"args": args,
	}
	if clientID != "" {
		params["client_id"] = clientID
	}
	if sessionID != "" {
		params["session_id"] = sessionID
	}
	return Message{
		Type:   "tool_request",
		Method: "execute_tool",
		Params: params,
	}
}

type ToolResponseMsg struct {
	Type   string       `json:"type"`
	Result *ContentWrap `json:"result,omitempty"`
	Error  *ContentWrap `json:"error,omitempty"`
}

type ContentWrap struct {
	Content           interface{} `json:"content"`
	StructuredContent interface{} `json:"structuredContent,omitempty"`
}
