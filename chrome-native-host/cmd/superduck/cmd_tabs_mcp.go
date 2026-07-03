package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strconv"
	"text/tabwriter"

	"chrome-native-host/internal/cliclient"
)

// cmdTabGroup dispatches the `tab_group <subcommand>` family.
//
//	superduck tab_group list [--create-if-empty]
//	superduck tab_group new [--force]
//	superduck tab_group finalize [--handoff TAB] [--deliverable TAB]
func cmdTabGroup(argv []string) error {
	if len(argv) == 0 {
		return fmt.Errorf("usage: superduck tab_group <list|new|finalize> [flags]")
	}
	sub, rest := argv[0], argv[1:]
	switch sub {
	case "list", "ls":
		return cmdTabGroupList(rest)
	case "new", "create":
		return cmdTabGroupNew(rest)
	case "finalize", "finish":
		return cmdTabGroupFinalize(rest)
	case "-h", "--help", "help":
		fmt.Println(`usage: superduck tab_group <subcommand> [flags]

Subcommands:
  list [--create-if-empty] [--name <text>]
                            Show the MCP tab group's tabs.
                            With --create-if-empty, create one when missing.
                            --name <text> titles the new group when creating.
  new [--force]             Create a fresh MCP tab group with one tab; refuses
                            to replace an existing session group unless --force is set.
                            --force discards that session's active/handoff tabs.
  finalize                  Finalize the current MCP tab group as an explicit tab disposition.
      --handoff TAB         Keep TAB in the managed group for continuation.
      --deliverable TAB     Keep TAB open but remove it from the managed group.

Examples:
  TAB=$(superduck --json tab_group list --create-if-empty | jq -r '.tabContext.currentTabId')
  superduck tab_group finalize --deliverable "$TAB"`)
		return nil
	default:
		return fmt.Errorf("unknown tab_group subcommand: %s (want list|new|finalize)", sub)
	}
}

type tabIDList []int

func (l *tabIDList) String() string {
	return fmt.Sprint([]int(*l))
}

func (l *tabIDList) Set(value string) error {
	id, err := strconv.Atoi(value)
	if err != nil || id <= 0 {
		return fmt.Errorf("invalid tab id: %s", value)
	}
	*l = append(*l, id)
	return nil
}

// cmdTabGroupList: superduck tab_group list [--create-if-empty] [--name <text>]
func cmdTabGroupList(argv []string) error {
	fs := flag.NewFlagSet("tab_group list", flag.ContinueOnError)
	createIfEmpty := fs.Bool("create-if-empty", false, "Create a new MCP tab group if none exists")
	name := fs.String("name", "", "Title the MCP tab group when creating it (🦆 marker is auto-prepended). Ignored if a group already exists.")
	if err := fs.Parse(argv); err != nil {
		return err
	}

	args := map[string]any{}
	if *createIfEmpty {
		args["createIfEmpty"] = true
	}
	if *name != "" {
		args["name"] = *name
	}

	rec := cliclient.AuditRecord{Cmd: "tab_group list"}
	if gflags.JSON {
		raw, err := cliclient.RunToolJSON("tabs_context_mcp", args, clientOpts(), &rec)
		if raw != "" {
			fmt.Println(raw)
		}
		return err
	}
	raw, err := cliclient.RunTool("tabs_context_mcp", args, clientOpts(), &rec)
	if err != nil {
		return err
	}
	return printGroupResult(raw)
}

// cmdTabGroupNew: superduck tab_group new [--force]
func cmdTabGroupNew(argv []string) error {
	fs := flag.NewFlagSet("tab_group new", flag.ContinueOnError)
	force := fs.Bool("force", false, "Discard the current session's active/handoff tabs and create a fresh group")
	if err := fs.Parse(argv); err != nil {
		return err
	}

	args := map[string]any{}
	if *force {
		args["force"] = true
	}

	rec := cliclient.AuditRecord{Cmd: "tab_group new"}
	if gflags.JSON {
		raw, err := cliclient.RunToolJSON("tabs_create_mcp", args, clientOpts(), &rec)
		if raw != "" {
			fmt.Println(raw)
		}
		return err
	}
	raw, err := cliclient.RunTool("tabs_create_mcp", args, clientOpts(), &rec)
	if err != nil {
		return err
	}
	return printGroupResult(raw)
}

// cmdTabGroupFinalize: superduck tab_group finalize [--handoff TAB] [--deliverable TAB]
func cmdTabGroupFinalize(argv []string) error {
	fs := flag.NewFlagSet("tab_group finalize", flag.ContinueOnError)
	var handoff tabIDList
	var deliverable tabIDList
	fs.Var(&handoff, "handoff", "Keep TAB in the managed group for continuation; may be repeated")
	fs.Var(&deliverable, "deliverable", "Keep TAB open but remove it from the managed group; may be repeated")
	if err := fs.Parse(argv); err != nil {
		return err
	}

	keep := make([]map[string]any, 0, len(handoff)+len(deliverable))
	for _, tabID := range handoff {
		keep = append(keep, map[string]any{"tabId": tabID, "status": "handoff"})
	}
	for _, tabID := range deliverable {
		keep = append(keep, map[string]any{"tabId": tabID, "status": "deliverable"})
	}
	args := map[string]any{}
	if len(keep) > 0 {
		args["keep"] = keep
	}

	rec := cliclient.AuditRecord{Cmd: "tab_group finalize"}
	if gflags.JSON {
		raw, err := cliclient.RunToolJSON("tabs_finalize_mcp", args, clientOpts(), &rec)
		if raw != "" {
			fmt.Println(raw)
		}
		return err
	}
	raw, err := cliclient.RunTool("tabs_finalize_mcp", args, clientOpts(), &rec)
	if err != nil {
		return err
	}
	return printGroupResult(raw)
}

func printGroupResult(raw string) error {
	var data struct {
		Output     string `json:"output"`
		Error      string `json:"error"`
		TabContext *struct {
			TabGroupID      int `json:"tabGroupId"`
			CurrentTabID    int `json:"currentTabId"`
			ExecutedOnTabID int `json:"executedOnTabId"`
			TabCount        int `json:"tabCount"`
			AvailableTabs   []struct {
				ID    int    `json:"id"`
				Title string `json:"title"`
				URL   string `json:"url"`
			} `json:"availableTabs"`
		} `json:"tabContext"`
	}
	if err := json.Unmarshal([]byte(raw), &data); err != nil {
		fmt.Println(raw)
		return nil
	}

	if data.Error != "" {
		return fmt.Errorf("%s", data.Error)
	}

	if data.TabContext != nil {
		fmt.Printf("tab group %d  (%d tabs", data.TabContext.TabGroupID, data.TabContext.TabCount)
		if data.TabContext.CurrentTabID != 0 {
			fmt.Printf(", current tab %d", data.TabContext.CurrentTabID)
		}
		fmt.Println(")")
		if len(data.TabContext.AvailableTabs) > 0 {
			w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
			fmt.Fprintln(w, "ID\tTITLE\tURL")
			for _, t := range data.TabContext.AvailableTabs {
				fmt.Fprintf(w, "%d\t%s\t%s\n", t.ID, truncate(t.Title, 40), truncate(t.URL, 60))
			}
			w.Flush()
		}
	}
	if data.Output != "" {
		if data.TabContext != nil && len(data.TabContext.AvailableTabs) > 0 {
			return nil
		}
		fmt.Println(data.Output)
	}
	return nil
}
