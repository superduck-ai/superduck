package main

import (
	"flag"
	"fmt"
)

// cmdKey is `superduck key --tab <id> <keys> [--repeat N]` — dispatches the
// `computer` tool's `key` action (space-separated keys or modifier combos).
// Note: this is distinct from the older top-level `press` command which goes
// through the extension's `superduck_press` tool instead.
func cmdKey(argv []string) error {
	fs := flag.NewFlagSet("key", flag.ContinueOnError)
	repeat := fs.Int("repeat", 0, "Repeat count (1-100)")
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}
	rest := fs.Args()
	if len(rest) < 1 {
		return fmt.Errorf(`usage: superduck key --tab <id> "<keys>" [--repeat N]`)
	}
	args := map[string]any{"text": rest[0]}
	if *repeat > 0 {
		args["repeat"] = *repeat
	}
	return runAction("key", args)
}
