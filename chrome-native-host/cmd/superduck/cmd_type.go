package main

import "fmt"

// cmdTypeText is `superduck type --tab <id> <text>` — typing characters into
// the focused element of the target tab.
func cmdTypeText(argv []string) error {
	if len(argv) < 1 {
		return fmt.Errorf("usage: superduck type --tab <id> <text>")
	}
	return runAction("type", map[string]any{"text": argv[0]})
}
