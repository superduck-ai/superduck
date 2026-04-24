package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"text/tabwriter"

	"chrome-native-host/internal/cliclient"
)

// cmdTabGroup dispatches the `tab_group <subcommand>` family.
//
//	superduck tab_group list [--create-if-empty]
//	superduck tab_group new
func cmdTabGroup(argv []string) error {
	if len(argv) == 0 {
		return fmt.Errorf("usage: superduck tab_group <list|new> [flags]")
	}
	sub, rest := argv[0], argv[1:]
	switch sub {
	case "list", "ls":
		return cmdTabGroupList(rest)
	case "new", "create":
		return cmdTabGroupNew(rest)
	case "-h", "--help", "help":
		fmt.Println(`usage: superduck tab_group <subcommand> [flags]

Subcommands:
  list [--create-if-empty]  Show the MCP tab group's tabs.
                            With --create-if-empty, create one when missing.
  new                       Create a new tab inside the MCP tab group; prints its tabId.

Examples:
  superduck tab_group list --create-if-empty
  TAB=$(superduck tab_group new | sed -n 's/.*Tab ID: *\([0-9]*\).*/\1/p' | head -1)`)
		return nil
	default:
		return fmt.Errorf("unknown tab_group subcommand: %s (want list|new)", sub)
	}
}

// cmdTabGroupList: superduck tab_group list [--create-if-empty]
func cmdTabGroupList(argv []string) error {
	fs := flag.NewFlagSet("tab_group list", flag.ContinueOnError)
	createIfEmpty := fs.Bool("create-if-empty", false, "Create a new MCP tab group if none exists")
	if err := fs.Parse(argv); err != nil {
		return err
	}

	args := map[string]any{}
	if *createIfEmpty {
		args["createIfEmpty"] = true
	}

	rec := cliclient.AuditRecord{Cmd: "tab_group list"}
	raw, err := cliclient.RunTool("tabs_context_mcp", args, clientOpts(), &rec)
	if err != nil {
		return err
	}
	return printGroupResult(raw)
}

// cmdTabGroupNew: superduck tab_group new
func cmdTabGroupNew(argv []string) error {
	fs := flag.NewFlagSet("tab_group new", flag.ContinueOnError)
	if err := fs.Parse(argv); err != nil {
		return err
	}

	rec := cliclient.AuditRecord{Cmd: "tab_group new"}
	raw, err := cliclient.RunTool("tabs_create_mcp", nil, clientOpts(), &rec)
	if err != nil {
		return err
	}
	return printGroupResult(raw)
}

func printGroupResult(raw string) error {
	if gflags.JSON {
		fmt.Println(raw)
		return nil
	}

	var data struct {
		Output     string `json:"output"`
		Error      string `json:"error"`
		TabContext *struct {
			TabGroupId      int `json:"tabGroupId"`
			CurrentTabId    int `json:"currentTabId"`
			ExecutedOnTabId int `json:"executedOnTabId"`
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
		fmt.Printf("tab group %d  (%d tabs", data.TabContext.TabGroupId, data.TabContext.TabCount)
		if data.TabContext.CurrentTabId != 0 {
			fmt.Printf(", current tab %d", data.TabContext.CurrentTabId)
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
