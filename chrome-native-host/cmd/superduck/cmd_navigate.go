package main

import (
	"flag"
	"fmt"
)

// cmdNavigate: superduck navigate --tab <id> <url|back|forward>
func cmdNavigate(argv []string) error {
	fs := flag.NewFlagSet("navigate", flag.ContinueOnError)
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}
	rest := fs.Args()
	if len(rest) < 1 {
		return fmt.Errorf("usage: superduck navigate --tab <id> <url|back|forward>")
	}
	return runSimpleTool("navigate", "navigate", map[string]any{"url": rest[0]})
}
