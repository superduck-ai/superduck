package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"regexp"
	"strconv"

	"chrome-native-host/internal/cliclient"
)

func cmdOpen(argv []string) error {
	fs := flag.NewFlagSet("open", flag.ContinueOnError)
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}
	rest := fs.Args()
	if len(rest) < 1 {
		return fmt.Errorf("usage: superduck open <url>")
	}
	url := rest[0]

	args := map[string]any{"url": url}
	var groupID int
	if gflags.Tab != 0 {
		args["tabId"] = gflags.Tab
	} else {
		tabID, gid, gerr := ensureMCPGroupTab()
		if gerr != nil {
			return gerr
		}
		args["tabId"] = tabID
		groupID = gid
	}

	rec := cliclient.AuditRecord{Cmd: "open"}
	rec.SetURL(url)
	raw, err := cliclient.RunTool("superduck_open", args, clientOpts(), &rec)
	if err != nil {
		return err
	}

	if gflags.JSON {
		var obj map[string]any
		if jerr := json.Unmarshal([]byte(raw), &obj); jerr == nil {
			delete(obj, "windowId")
			if groupID != 0 {
				obj["tabGroupId"] = groupID
			}
			if out, merr := json.Marshal(obj); merr == nil {
				fmt.Println(string(out))
				return nil
			}
		}
		fmt.Println(raw)
		return nil
	}
	var data map[string]any
	if jerr := json.Unmarshal([]byte(raw), &data); jerr == nil {
		if groupID != 0 {
			fmt.Printf("opened %s in tab %s (group %d)\n",
				url, numAsInt(data["tabId"]), groupID)
		} else {
			fmt.Printf("opened %s in tab %s\n",
				url, numAsInt(data["tabId"]))
		}
		return nil
	}
	fmt.Println(raw)
	return nil
}

// ensureMCPGroupTab makes sure an MCP tab group exists and returns a tab id
// inside the group that `open` can safely navigate, along with the tab group id.
// When the group does not exist yet, we rely on the tab that
// `tabs_context_mcp {createIfEmpty:true}` creates as a side effect, to avoid
// leaving an extra empty tab behind.
func ensureMCPGroupTab() (int, int, error) {
	ctxRec := cliclient.AuditRecord{Cmd: "open (group context)"}
	ctxRaw, err := cliclient.RunTool("tabs_context_mcp", nil, clientOpts(), &ctxRec)
	if err != nil {
		return 0, 0, err
	}

	if gid, ok := parseGroupID(ctxRaw); ok {
		createRec := cliclient.AuditRecord{Cmd: "open (group create)"}
		raw, cerr := cliclient.RunTool("tabs_create_mcp", nil, clientOpts(), &createRec)
		if cerr != nil {
			return 0, 0, cerr
		}
		if id, ok := parseTabID(raw); ok {
			return id, gid, nil
		}
		return 0, 0, fmt.Errorf("tabs_create_mcp returned no tab id: %s", raw)
	}

	initRec := cliclient.AuditRecord{Cmd: "open (group init)"}
	raw, err := cliclient.RunTool("tabs_context_mcp", map[string]any{"createIfEmpty": true}, clientOpts(), &initRec)
	if err != nil {
		return 0, 0, err
	}
	id, okTab := parseFirstTabID(raw)
	gid, okGid := parseGroupID(raw)
	if okTab && okGid {
		return id, gid, nil
	}
	return 0, 0, fmt.Errorf("tabs_context_mcp(createIfEmpty) returned no tab/group id: %s", raw)
}

var tabIDLabelRe = regexp.MustCompile(`Tab ID:\s*(\d+)`)
var tabIDLineRe = regexp.MustCompile(`(?m)^\s*-\s*tabId\s+(\d+)`)
var tabGroupRe = regexp.MustCompile(`(?m)^Tab Group\s+(\d+):`)

func parseGroupID(raw string) (int, bool) {
	if m := tabGroupRe.FindStringSubmatch(raw); len(m) == 2 {
		if id, err := strconv.Atoi(m[1]); err == nil {
			return id, true
		}
	}
	return 0, false
}

func parseTabID(raw string) (int, bool) {
	if m := tabIDLabelRe.FindStringSubmatch(raw); len(m) == 2 {
		if id, err := strconv.Atoi(m[1]); err == nil {
			return id, true
		}
	}
	return 0, false
}

func parseFirstTabID(raw string) (int, bool) {
	if m := tabIDLineRe.FindStringSubmatch(raw); len(m) == 2 {
		if id, err := strconv.Atoi(m[1]); err == nil {
			return id, true
		}
	}
	return 0, false
}
