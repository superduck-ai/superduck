package main

import (
	"flag"
	"fmt"
)

// cmdScroll: `superduck scroll --tab <id> <x> <y> --direction D [--amount N]`.
func cmdScroll(argv []string) error {
	fs := flag.NewFlagSet("scroll", flag.ContinueOnError)
	dir := fs.String("direction", "", "up|down|left|right")
	amount := fs.Int("amount", 0, "Scroll wheel ticks (1-10)")
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}
	c, _, err := parseCoord(fs.Args())
	if err != nil {
		return fmt.Errorf("usage: superduck scroll --tab <id> <x> <y> --direction <up|down|left|right> [--amount N]")
	}
	if *dir == "" {
		return fmt.Errorf("--direction is required")
	}
	args := map[string]any{
		"coordinate":       []float64{c[0], c[1]},
		"scroll_direction": *dir,
	}
	if *amount > 0 {
		args["scroll_amount"] = *amount
	}
	return runAction("scroll", args)
}
