package main

import (
	"flag"
	"fmt"
)

// cmdShortcuts: superduck shortcuts list --tab <id>
//               superduck shortcuts execute --tab <id> [--id I] [--command C]
func cmdShortcuts(argv []string) error {
	if len(argv) == 0 {
		return fmt.Errorf("usage: superduck shortcuts <list|execute> --tab <id> [...]")
	}
	sub, rest := argv[0], argv[1:]
	switch sub {
	case "list":
		return runSimpleTool("shortcuts_list", "shortcuts list", map[string]any{})
	case "execute", "exec", "run":
		fs := flag.NewFlagSet("shortcuts execute", flag.ContinueOnError)
		id := fs.String("id", "", "Shortcut ID")
		command := fs.String("command", "", "Shortcut command name (no leading slash)")
		if err := fs.Parse(reorderFlagsFirst(rest)); err != nil {
			return err
		}
		if *id == "" && *command == "" {
			return fmt.Errorf("provide --id or --command")
		}
		args := map[string]any{}
		if *id != "" {
			args["shortcutId"] = *id
		}
		if *command != "" {
			args["command"] = *command
		}
		return runSimpleTool("shortcuts_execute", "shortcuts execute", args)
	default:
		return fmt.Errorf("unknown subcommand: %s", sub)
	}
}
