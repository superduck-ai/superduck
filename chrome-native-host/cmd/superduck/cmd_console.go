package main

import "flag"

// cmdConsole: superduck console --tab <id> [--pattern P] [--only-errors]
//                               [--clear] [--limit N]
func cmdConsole(argv []string) error {
	fs := flag.NewFlagSet("console", flag.ContinueOnError)
	pattern := fs.String("pattern", "", "Regex filter")
	onlyErrors := fs.Bool("only-errors", false, "Only error/exception messages")
	clear := fs.Bool("clear", false, "Clear messages after reading")
	limit := fs.Int("limit", 0, "Max messages (default 100)")
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}
	args := map[string]any{}
	if *pattern != "" {
		args["pattern"] = *pattern
	}
	if *onlyErrors {
		args["onlyErrors"] = true
	}
	if *clear {
		args["clear"] = true
	}
	if *limit > 0 {
		args["limit"] = *limit
	}
	return runSimpleTool("read_console_messages", "console", args)
}
