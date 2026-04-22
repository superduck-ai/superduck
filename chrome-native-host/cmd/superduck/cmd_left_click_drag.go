package main

import "fmt"

// cmdLeftClickDrag: `superduck left_click_drag --tab <id> <x1> <y1> <x2> <y2>`.
func cmdLeftClickDrag(argv []string) error {
	if len(argv) < 4 {
		return fmt.Errorf("usage: superduck left_click_drag --tab <id> <x1> <y1> <x2> <y2>")
	}
	start, rest, err := parseCoord(argv)
	if err != nil {
		return err
	}
	end, _, err := parseCoord(rest)
	if err != nil {
		return err
	}
	return runAction("left_click_drag", map[string]any{
		"start_coordinate": []float64{start[0], start[1]},
		"coordinate":       []float64{end[0], end[1]},
	})
}
