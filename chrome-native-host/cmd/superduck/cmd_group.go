package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"text/tabwriter"

	"chrome-native-host/internal/cliclient"
)

func cmdGroup(argv []string) error {
	if len(argv) == 0 {
		return fmt.Errorf("usage: superduck group <context|create> [flags]")
	}
	sub, rest := argv[0], argv[1:]
	switch sub {
	case "context", "ctx":
		return cmdGroupContext(rest)
	case "create", "new":
		return cmdGroupCreate(rest)
	case "-h", "--help", "help":
		fmt.Fprintln(os.Stderr, "usage: superduck group <context|create> [flags]")
		fmt.Fprintln(os.Stderr, "  context [--create]  Show MCP tab group context (use --create to create one if missing)")
		fmt.Fprintln(os.Stderr, "  create              Create a new tab inside the MCP tab group")
		return nil
	default:
		return fmt.Errorf("unknown group subcommand: %s", sub)
	}
}

func cmdGroupContext(argv []string) error {
	fs := flag.NewFlagSet("group context", flag.ContinueOnError)
	createIfEmpty := fs.Bool("create", false, "Create a new MCP tab group if none exists")
	if err := fs.Parse(argv); err != nil {
		return err
	}

	args := map[string]any{}
	if *createIfEmpty {
		args["createIfEmpty"] = true
	}

	rec := cliclient.AuditRecord{Cmd: "group context"}
	raw, err := cliclient.RunTool("tabs_context_mcp", args, clientOpts(), &rec)
	if err != nil {
		return err
	}
	return printGroupResult(raw)
}

func cmdGroupCreate(argv []string) error {
	fs := flag.NewFlagSet("group create", flag.ContinueOnError)
	if err := fs.Parse(argv); err != nil {
		return err
	}

	rec := cliclient.AuditRecord{Cmd: "group create"}
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
		Output      string `json:"output"`
		Error       string `json:"error"`
		TabContext  *struct {
			TabGroupId    int `json:"tabGroupId"`
			CurrentTabId  int `json:"currentTabId"`
			ExecutedOnTabId int `json:"executedOnTabId"`
			TabCount      int `json:"tabCount"`
			AvailableTabs []struct {
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
			// 已经渲染过表格，避免重复打印 output 中的列表
			return nil
		}
		fmt.Println(data.Output)
	}
	return nil
}
