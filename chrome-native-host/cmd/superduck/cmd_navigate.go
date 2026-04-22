package main

import "fmt"

// cmdNavigate: superduck navigate --tab <id> <url|back|forward>
func cmdNavigate(argv []string) error {
	if len(argv) < 1 {
		return fmt.Errorf("usage: superduck navigate --tab <id> <url|back|forward>")
	}
	return runSimpleTool("navigate", "navigate", map[string]any{"url": argv[0]})
}
