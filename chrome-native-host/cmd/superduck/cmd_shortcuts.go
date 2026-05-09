package main

import (
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"sort"
	"strings"
	"text/tabwriter"

	"chrome-native-host/internal/cliclient"
)

// cmdShortcuts implements the `shortcuts` subcommand following clig.dev style:
//
//	superduck shortcuts list                       List shortcuts (table; --json for raw)
//	superduck shortcuts get <name> [args...]       Fetch + render the shortcut prompt
//
// `get` resolves <name> as command name first, falls back to id. Positional
// args fill {{var}} placeholders in the prompt by first-appearance order.
// Unfilled placeholders are left untouched. Use --show-vars to inspect the
// variable list, --strict to exit non-zero when any placeholder remains
// unbound, --json to emit a structured payload.
//
// The CLI never executes the shortcut against a tab — it only fetches the
// prompt text from the extension's saved-prompts store so a local agent can
// drive the browser itself. This mirrors the in-browser behavior, where the
// sidepanel resolves a `[[shortcut:id:name]]` marker into the same prompt
// before sending to the model: same source, same rendering, different driver.
func cmdShortcuts(argv []string) error {
	if len(argv) == 0 {
		return shortcutsUsage()
	}
	switch argv[0] {
	case "list", "ls":
		return shortcutsList()
	case "get", "show":
		return shortcutsGet(argv[1:])
	case "-h", "--help", "help":
		fmt.Fprintln(os.Stdout, shortcutsHelp())
		return nil
	default:
		return fmt.Errorf("unknown subcommand: %s\n\n%s", argv[0], shortcutsHelp())
	}
}

func shortcutsUsage() error {
	return fmt.Errorf("usage: superduck shortcuts <list|get> [...]\n\n%s", shortcutsHelp())
}

func shortcutsHelp() string {
	return `superduck shortcuts — fetch saved prompt shortcuts for a local agent to execute

USAGE:
  superduck shortcuts list                       List all shortcuts
  superduck shortcuts get <name> [args...]       Fetch the shortcut prompt (with vars filled)

DESCRIPTION:
  Shortcuts (a.k.a. workflows) are reusable browser-automation prompts saved in
  the SuperDuck Chrome extension. ` + "`get`" + ` reads one out of the extension's saved-
  prompts store, fills in any {{var}} placeholders, and prints the resulting
  prompt to stdout — for a local agent (Claude Code, your own script, etc.) to
  pick up and drive the browser via the other ` + "`superduck`" + ` subcommands.

  The CLI does NOT open the in-browser sidepanel or run the shortcut itself.
  ` + "`show`" + ` is accepted as an alias for ` + "`get`" + `.

GET FLAGS:
  --var key=value        Bind a named variable. May repeat. Overrides positional args.
  --show-vars            Print only the variable names (one per line) and exit
  --strict               Exit non-zero if any {{var}} remains unbound
  --json                 Emit JSON {id, command, prompt, vars, unbound, start_url, ...}

POSITIONAL ARGUMENTS:
  Args fill {{var}} placeholders left over after auto-binding and --var.
  Order is the placeholder's first appearance in the prompt. Auto-bound names:
    {{url}} / {{search_url}} / {{start_url}}  ← shortcut's "开始于" URL
    {{command}} / {{id}} / {{model}}          ← shortcut metadata
  Unfilled placeholders are left untouched (literal {{var}} in output).

EXAMPLES:
  superduck shortcuts list
  superduck shortcuts list --json
  superduck shortcuts get B站搜索 --show-vars
  superduck shortcuts get B站搜索 cvte                       # positional
  superduck shortcuts get B站搜索 --var search_query=cvte    # named (agent-friendly)
  superduck shortcuts get B站搜索 cvte --json | jq .prompt`
}

// --- list ---

type shortcutItem struct {
	ID              string   `json:"id"`
	Command         string   `json:"command,omitempty"`
	Type            string   `json:"type,omitempty"`
	URL             string   `json:"url,omitempty"`
	Vars            []string `json:"vars,omitempty"`
	Model           string   `json:"model,omitempty"`
	SkipPermissions bool     `json:"skipPermissions,omitempty"`
}

func shortcutsList() error {
	rec := cliclient.AuditRecord{Cmd: "shortcuts list"}
	raw, err := cliclient.RunTool("shortcuts_list", map[string]any{}, clientOpts(), &rec)
	if err != nil {
		return err
	}
	var payload struct {
		Message   string         `json:"message"`
		Shortcuts []shortcutItem `json:"shortcuts"`
	}
	if jerr := json.Unmarshal([]byte(raw), &payload); jerr != nil {
		fmt.Println(raw)
		return nil
	}
	if gflags.JSON {
		out, _ := json.Marshal(payload.Shortcuts)
		fmt.Println(string(out))
		return nil
	}
	if len(payload.Shortcuts) == 0 {
		fmt.Fprintln(os.Stderr, "no shortcuts saved")
		return nil
	}
	sort.SliceStable(payload.Shortcuts, func(i, j int) bool {
		return payload.Shortcuts[i].Command < payload.Shortcuts[j].Command
	})
	tw := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(tw, "COMMAND\tVARS\tSTART URL\tID")
	for _, s := range payload.Shortcuts {
		cmd := s.Command
		if cmd == "" {
			cmd = "-"
		}
		vars := strings.Join(s.Vars, ",")
		if vars == "" {
			vars = "-"
		}
		url := s.URL
		if url == "" {
			url = "-"
		}
		fmt.Fprintf(tw, "%s\t%s\t%s\t%s\n", cmd, vars, url, s.ID)
	}
	return tw.Flush()
}

// --- run ---

type shortcutDetail struct {
	ID              string `json:"id"`
	Command         string `json:"command,omitempty"`
	Type            string `json:"type,omitempty"`
	Prompt          string `json:"prompt"`
	URL             string `json:"url,omitempty"`
	Model           string `json:"model,omitempty"`
	SkipPermissions bool   `json:"skipPermissions,omitempty"`
}

// {{ name }} — single-segment, no nesting, optional surrounding spaces.
var mustacheRE = regexp.MustCompile(`\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}`)

func shortcutsGet(argv []string) error {
	name, posArgs, namedVars, showVars, strict, err := parseRunArgs(argv)
	if err != nil {
		return err
	}
	if name == "" {
		return fmt.Errorf("usage: superduck shortcuts get <name> [args...]")
	}

	detail, err := fetchShortcut(map[string]any{"shortcutId": name, "command": name})
	if err != nil {
		return err
	}

	vars := extractVars(detail.Prompt)

	if showVars {
		for _, v := range vars {
			fmt.Println(v)
		}
		return nil
	}

	bindings := autoBindFromDetail(vars, detail)
	for k, v := range namedVars {
		bindings[k] = v
	}
	bindRemaining(vars, posArgs, bindings)
	rendered := renderPrompt(detail.Prompt, bindings)
	unbound := unboundVars(vars, bindings)

	if gflags.JSON {
		payload := map[string]any{
			"id":      detail.ID,
			"command": detail.Command,
			"prompt":  rendered,
			"vars":    bindings,
			"unbound": unbound,
		}
		if detail.URL != "" {
			payload["start_url"] = detail.URL
		}
		if detail.Type != "" {
			payload["type"] = detail.Type
		}
		if detail.Model != "" {
			payload["model"] = detail.Model
		}
		if detail.SkipPermissions {
			payload["skip_permissions"] = true
		}
		out, _ := json.MarshalIndent(payload, "", "  ")
		fmt.Println(string(out))
	} else {
		fmt.Println(rendered)
		if len(unbound) > 0 {
			fmt.Fprintf(os.Stderr, "warning: %d unbound placeholder(s): %s\n",
				len(unbound), strings.Join(unbound, ", "))
		}
	}

	if strict && len(unbound) > 0 {
		return fmt.Errorf("strict: %d unbound placeholder(s)", len(unbound))
	}
	return nil
}

// parseRunArgs separates flags from positional args. Flags can appear anywhere
// after <name>. Anything after `--` is treated as positional verbatim.
//
// `--var key=value` (or `--var key value`) sets a named binding that takes
// precedence over positional args — useful for agents that don't want to track
// placeholder ordering.
func parseRunArgs(argv []string) (name string, posArgs []string, namedVars map[string]string, showVars, strict bool, err error) {
	namedVars = map[string]string{}
	if len(argv) == 0 {
		return "", nil, namedVars, false, false, nil
	}
	rest := argv
	if strings.HasPrefix(rest[0], "-") {
		err = fmt.Errorf("first argument must be the shortcut name, got %q", rest[0])
		return
	}
	name = strings.TrimPrefix(strings.TrimSpace(rest[0]), "/")
	rest = rest[1:]

	literal := false
	for i := 0; i < len(rest); i++ {
		a := rest[i]
		if literal {
			posArgs = append(posArgs, a)
			continue
		}
		switch {
		case a == "--":
			literal = true
		case a == "--show-vars":
			showVars = true
		case a == "--strict":
			strict = true
		case a == "--var":
			if i+1 >= len(rest) {
				err = fmt.Errorf("--var needs an argument (key=value)")
				return
			}
			i++
			k, v, ok := strings.Cut(rest[i], "=")
			if !ok || k == "" {
				err = fmt.Errorf("--var expects key=value, got %q", rest[i])
				return
			}
			namedVars[k] = v
		case strings.HasPrefix(a, "--var="):
			k, v, ok := strings.Cut(strings.TrimPrefix(a, "--var="), "=")
			if !ok || k == "" {
				err = fmt.Errorf("--var expects key=value, got %q", a)
				return
			}
			namedVars[k] = v
		case strings.HasPrefix(a, "--"):
			err = fmt.Errorf("unknown flag: %s", a)
			return
		default:
			posArgs = append(posArgs, a)
		}
	}
	return
}

func extractVars(prompt string) []string {
	matches := mustacheRE.FindAllStringSubmatch(prompt, -1)
	seen := map[string]bool{}
	var out []string
	for _, m := range matches {
		v := m[1]
		if !seen[v] {
			seen[v] = true
			out = append(out, v)
		}
	}
	return out
}

// urlAliasSet is the set of placeholder names that resolve to the shortcut's
// "开始于" URL. Lowercase keys; lookups use strings.ToLower on the var name.
var urlAliasSet = map[string]bool{
	"url": true, "search_url": true, "start_url": true, "starting_url": true,
}

// autoBindFromDetail seeds bindings from the shortcut's own metadata so users
// don't have to repeat it on the command line.
func autoBindFromDetail(vars []string, d *shortcutDetail) map[string]string {
	out := map[string]string{}
	for _, v := range vars {
		switch {
		case urlAliasSet[strings.ToLower(v)] && d.URL != "":
			out[v] = d.URL
		case strings.EqualFold(v, "command") && d.Command != "":
			out[v] = d.Command
		case strings.EqualFold(v, "id") && d.ID != "":
			out[v] = d.ID
		case strings.EqualFold(v, "model") && d.Model != "":
			out[v] = d.Model
		}
	}
	return out
}

func bindRemaining(vars, args []string, bindings map[string]string) {
	i := 0
	for _, v := range vars {
		if _, ok := bindings[v]; ok {
			continue
		}
		if i >= len(args) {
			return
		}
		bindings[v] = args[i]
		i++
	}
}

func renderPrompt(prompt string, bindings map[string]string) string {
	return mustacheRE.ReplaceAllStringFunc(prompt, func(match string) string {
		name := strings.TrimSpace(match[2 : len(match)-2])
		if v, ok := bindings[name]; ok {
			return v
		}
		return match
	})
}

func unboundVars(vars []string, bindings map[string]string) []string {
	var out []string
	for _, v := range vars {
		if _, ok := bindings[v]; !ok {
			out = append(out, v)
		}
	}
	return out
}

func fetchShortcut(args map[string]any) (*shortcutDetail, error) {
	rec := cliclient.AuditRecord{Cmd: "shortcuts get"}
	raw, err := cliclient.RunTool("shortcuts_get", args, clientOpts(), &rec)
	if err != nil {
		return nil, err
	}
	var d shortcutDetail
	if jerr := json.Unmarshal([]byte(raw), &d); jerr != nil {
		return nil, fmt.Errorf("malformed backend response: %w", jerr)
	}
	return &d, nil
}
