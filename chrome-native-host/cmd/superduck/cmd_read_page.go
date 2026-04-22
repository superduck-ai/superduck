package main

import "flag"

// cmdReadPage: superduck read_page --tab <id> [--filter interactive|all]
//                                  [--depth N] [--ref R] [--max-chars N]
func cmdReadPage(argv []string) error {
	fs := flag.NewFlagSet("read_page", flag.ContinueOnError)
	filter := fs.String("filter", "", `"interactive" or "all" (default: all)`)
	depth := fs.Int("depth", 0, "Max tree depth (default 15)")
	ref := fs.String("ref", "", "Parent ref id to focus on")
	maxChars := fs.Int("max-chars", 0, "Max output characters (default 50000)")
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}
	args := map[string]any{}
	if *filter != "" {
		args["filter"] = *filter
	}
	if *depth > 0 {
		args["depth"] = *depth
	}
	if *ref != "" {
		args["ref_id"] = *ref
	}
	if *maxChars > 0 {
		args["max_chars"] = *maxChars
	}
	return runSimpleTool("read_page", "read_page", args)
}
