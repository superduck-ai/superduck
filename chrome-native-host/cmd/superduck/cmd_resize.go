package main

import (
	"fmt"
	"strconv"
)

// cmdResize: superduck resize --tab <id> <width> <height>
func cmdResize(argv []string) error {
	if len(argv) < 2 {
		return fmt.Errorf("usage: superduck resize --tab <id> <width> <height>")
	}
	w, err := strconv.Atoi(argv[0])
	if err != nil {
		return fmt.Errorf("invalid width: %v", err)
	}
	h, err := strconv.Atoi(argv[1])
	if err != nil {
		return fmt.Errorf("invalid height: %v", err)
	}
	return runSimpleTool("resize_window", "resize", map[string]any{"width": w, "height": h})
}
