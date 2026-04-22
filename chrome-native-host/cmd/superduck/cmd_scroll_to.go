package main

import (
	"flag"
	"fmt"
)

// cmdScrollTo: `superduck scroll_to --tab <id> --ref <refId>` scrolls an
// element (identified by a ref id returned by read_page / find tools) into view.
func cmdScrollTo(argv []string) error {
	fs := flag.NewFlagSet("scroll_to", flag.ContinueOnError)
	ref := fs.String("ref", "", "Element reference ID")
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}
	if *ref == "" {
		return fmt.Errorf("usage: superduck scroll_to --tab <id> --ref <refId>")
	}
	return runAction("scroll_to", map[string]any{"ref": *ref})
}
