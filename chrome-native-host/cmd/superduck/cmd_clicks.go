package main

import (
	"flag"
	"fmt"
)

// runClickLike handles left_click / right_click / double_click / triple_click /
// hover — they share the same arg shape: (x,y) or --ref, plus optional
// --modifiers (hover excluded).
func runClickLike(action string, argv []string, allowModifiers bool) error {
	fs := flag.NewFlagSet(action, flag.ContinueOnError)
	var modifiers string
	if allowModifiers {
		fs.StringVar(&modifiers, "modifiers", "", `Modifier keys, e.g. "ctrl+shift"`)
	}
	ref := fs.String("ref", "", "Element reference ID (alternative to coordinates)")
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}

	args := map[string]any{}
	if *ref != "" {
		args["ref"] = *ref
	} else {
		c, _, err := parseCoord(fs.Args())
		if err != nil {
			usage := fmt.Sprintf("usage: superduck %s --tab <id> <x> <y> (or --ref REF)", action)
			if allowModifiers {
				usage += " [--modifiers MODS]"
			}
			return fmt.Errorf("%s", usage)
		}
		args["coordinate"] = []float64{c[0], c[1]}
	}
	if allowModifiers && modifiers != "" {
		args["modifiers"] = modifiers
	}
	return runAction(action, args)
}

func cmdLeftClick(argv []string) error   { return runClickLike("left_click", argv, true) }
func cmdRightClick(argv []string) error  { return runClickLike("right_click", argv, true) }
func cmdDoubleClick(argv []string) error { return runClickLike("double_click", argv, true) }
func cmdTripleClick(argv []string) error { return runClickLike("triple_click", argv, true) }
func cmdHover(argv []string) error       { return runClickLike("hover", argv, false) }
