package main

// cmdPageText: superduck page_text --tab <id>
func cmdPageText(argv []string) error {
	_ = argv
	return runSimpleTool("get_page_text", "page_text", map[string]any{})
}
