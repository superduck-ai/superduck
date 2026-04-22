package main

import (
	"flag"
	"fmt"
	"strconv"
)

// cmdFormInput: superduck form_input --tab <id> --ref <r> --value <v>
// value is parsed as bool ("true"/"false") or number if possible, else string.
func cmdFormInput(argv []string) error {
	fs := flag.NewFlagSet("form_input", flag.ContinueOnError)
	ref := fs.String("ref", "", "Element reference ID")
	value := fs.String("value", "", "Value to set (string/number/bool)")
	rawString := fs.Bool("string", false, "Force value to be sent as a string")
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}
	if *ref == "" {
		return fmt.Errorf("--ref is required")
	}
	parsed := parseFormValue(*value, *rawString)
	return runSimpleTool("form_input", "form_input", map[string]any{
		"ref":   *ref,
		"value": parsed,
	})
}

func parseFormValue(s string, forceString bool) any {
	if forceString {
		return s
	}
	switch s {
	case "true":
		return true
	case "false":
		return false
	}
	if n, err := strconv.ParseInt(s, 10, 64); err == nil {
		return n
	}
	if f, err := strconv.ParseFloat(s, 64); err == nil {
		return f
	}
	return s
}
