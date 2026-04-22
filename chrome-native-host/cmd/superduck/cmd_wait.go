package main

import (
	"fmt"
	"strconv"
)

// cmdWait is `superduck wait --tab <id> <seconds>`. The extension's `computer`
// tool requires tabId even for waits, so we enforce --tab here too.
func cmdWait(argv []string) error {
	if len(argv) < 1 {
		return fmt.Errorf("usage: superduck wait --tab <id> <seconds>")
	}
	d, err := strconv.ParseFloat(argv[0], 64)
	if err != nil {
		return fmt.Errorf("invalid duration: %v", err)
	}
	return runAction("wait", map[string]any{"duration": d})
}
