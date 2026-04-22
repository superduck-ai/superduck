package main

import "fmt"

// cmdFind: superduck find --tab <id> <query>
func cmdFind(argv []string) error {
	if len(argv) < 1 {
		return fmt.Errorf(`usage: superduck find --tab <id> "<query>"`)
	}
	return runSimpleTool("find", "find", map[string]any{"query": argv[0]})
}
