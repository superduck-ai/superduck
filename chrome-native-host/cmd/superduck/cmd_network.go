package main

import "flag"

// cmdNetwork: superduck network --tab <id> [--url-pattern P] [--clear] [--limit N]
func cmdNetwork(argv []string) error {
	fs := flag.NewFlagSet("network", flag.ContinueOnError)
	urlPattern := fs.String("url-pattern", "", "Substring URL filter")
	clear := fs.Bool("clear", false, "Clear after reading")
	limit := fs.Int("limit", 0, "Max requests (default 100)")
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}
	args := map[string]any{}
	if *urlPattern != "" {
		args["urlPattern"] = *urlPattern
	}
	if *clear {
		args["clear"] = true
	}
	if *limit > 0 {
		args["limit"] = *limit
	}
	return runSimpleTool("read_network_requests", "network", args)
}
