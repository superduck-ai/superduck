package main

import (
	"flag"
	"fmt"
)

// cmdPageText: superduck page_text --tab <id> [--format text|html|markdown] [--max-chars N]
func cmdPageText(argv []string) error {
	fs := flag.NewFlagSet("page_text", flag.ContinueOnError)
	format := fs.String("format", "text", "Output format: text (default), html, or markdown")
	maxChars := fs.Int("max-chars", 0, "Max output characters (default 50000)")
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}

	// Validate format enum locally so an invalid value fails fast with a clear
	// message instead of surfacing a confusing "unexpected result" from the
	// extension.
	switch *format {
	case "text", "html", "markdown":
	default:
		return fmt.Errorf("invalid --format %q: must be 'text', 'html', or 'markdown'", *format)
	}

	args := map[string]any{}
	if *format != "text" {
		args["format"] = *format
	}
	if *maxChars > 0 {
		args["max_chars"] = *maxChars
	}
	return runSimpleTool("get_page_text", "page_text", args)
}
