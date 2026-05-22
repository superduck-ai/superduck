package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"time"

	"chrome-native-host/internal/analytics"
	"chrome-native-host/internal/cliclient"
	"chrome-native-host/internal/errortrack"
	"chrome-native-host/internal/selfupdate"
)

// version is set at build time via -ldflags "-X main.version=..."
// Falls back to the value below for local dev builds.
var version = "0.2.5"

const usage = `superduck %s — your browser's session, callable as a tool.

USAGE:
  superduck <command> [flags]
  superduck --tab <id> <command> [flags]      most browser commands need --tab

WORKFLOW:
  1. superduck tab_group list --create-if-empty   ensure an MCP tab group exists
  2. TAB=$(superduck tab_group new ...)           create a fresh tab, grab its tabId
  3. superduck --tab $TAB navigate <url>          drive that tab from the CLI

SETUP / DIAGNOSTICS:
  init                       Install native messaging manifest and start the native-host
                             (run once after 'npm install -g superduck-cli')
  doctor                     Health-check binary, manifest, native-host UDS, extension
  update [--check]           Check for and install CLI updates
  log [--tail N] [--json]    Tail the audit log (~/.superduck/audit.jsonl)
  version                    Print CLI version

ACTIVE-TAB UTILITIES (no --tab required):
  context [--full]           Read url/title/selection/visible text from the active tab
  tabs                       List every Chrome tab the extension can see

MCP TAB GROUP (each conversation usually owns one group of tabs):
  tab_group list [--create-if-empty]
                             Show the MCP tab group's tabs; --create-if-empty makes one
                             if missing. Run this once before any --tab command.
  tab_group new              Create a new empty tab inside the MCP tab group and print
                             its tabId; pair with 'navigate' to load a URL.

MOUSE / KEYBOARD (all require --tab <id>):
  left_click <x> <y> [--modifiers M] [--ref R]
                             Single left-click at viewport (x,y). --ref clicks an element id
                             returned by read_page instead of coordinates.
  right_click <x> <y> [--modifiers M] [--ref R]
                             Right-click (opens context menu in real apps).
  double_click <x> <y> [--modifiers M] [--ref R]
                             Double-click — useful for selecting a word, opening rows, etc.
  triple_click <x> <y> [--modifiers M] [--ref R]
                             Triple-click — selects the entire line / paragraph.
  hover <x> <y> [--ref R]    Move the cursor over a point/element to reveal tooltips & hover UI.
  left_click_drag <x1> <y1> <x2> <y2>
                             Press at (x1,y1), drag to (x2,y2), release. Drag-and-drop, sliders.
  type <text>                Type literal text into the focused element.
  key "<combo>" [--repeat N] Press a key or shortcut: "Enter", "Backspace", "cmd+a",
                             "ctrl+shift+t". Use --repeat to press multiple times.
  scroll <x> <y> --direction <up|down|left|right> [--amount N]
                             Scroll wheel ticks at (x,y); --amount is wheel ticks (default 3).
  scroll_to --ref <refId>    Scroll a specific element (from read_page refs) into view.
  wait <seconds>             Pause the CLI between actions (e.g. wait 0.5).
  zoom <x0> <y0> <x1> <y1> [--output PATH]
                             Capture a rectangular region as a PNG/JPEG (good for icon inspection).

PAGE / DOM (require --tab <id>):
  exec <js> | --file PATH | --stdin
                             Evaluate JS in the page context. The last expression's value is
                             returned (do NOT use 'return'). Use for assertions and debugging.
  page_text                  Extract the main article text (skips chrome/nav, like Reader Mode).
  read_page [--filter interactive|all] [--depth N] [--ref R] [--max-chars N]
                             Accessibility-tree snapshot with stable ref ids. Filter to
                             'interactive' for buttons/links/inputs only.
  form_input --ref <r> --value <v> [--string]
                             Set a form field by ref. Booleans toggle checkboxes; option text
                             or value selects a <select>. --string forces string interpretation.
  screenshot [--output PATH] Capture the visible viewport as PNG/JPEG. PATH may be a directory.

OBSERVABILITY (require --tab <id>):
  console [--pattern P] [--only-errors] [--clear] [--limit N]
                             Read browser console messages from the current page (only those
                             since the last --clear). Always pass --pattern to filter noise.
  network [--url-pattern P] [--clear] [--limit N]
                             List XHR/fetch/document requests captured for this tab.

WINDOW / NAV (require --tab <id>):
  resize <w> <h>             Resize the browser window — useful for responsive testing.
  navigate <url|back|forward>
                             Load a URL, or move through history. Pair with 'tab_group new'
                             to drive a freshly created blank tab.

UPLOAD / SHORTCUTS / GIF (require --tab <id>):
  upload --image-id <id> (--ref R | --coord x,y) [--filename N]
                             Drop a previously captured image onto a file input or drag target
                             (works for hidden <input type=file>).
  shortcuts list             List saved shortcuts (use --json for machine output).
  shortcuts get <name|id>    Fetch a shortcut's prompt (with vars filled) to stdout.
                             Pipe into your local agent — the CLI does NOT run it.
  gif start                  Begin recording browser actions for the current tab group.
  gif stop                   Stop recording (frames retained — call export or clear).
  gif export [--download] [--filename N] [--quality N] [--no-clicks] [--no-labels] [--no-progress] [--no-watermark]
                             Render the captured frames into a GIF; --download saves a file.
  gif clear                  Discard captured frames without exporting.

GLOBAL FLAGS:
  --json            Machine-readable output (stdout = single JSON object)
  --tab <id>        Target a specific tab (overrides active-tab resolution).
                    Required for almost every browser command.
  --socket <path>   Native-host UDS path (default %s)
  --timeout <s>     Per-request timeout in seconds (default 30)

EXAMPLES:
  # discover / create a tab to drive
  superduck tab_group list --create-if-empty
  TAB=$(superduck tab_group new | sed -n 's/.*Tab ID: *\([0-9]*\).*/\1/p' | head -1)
  superduck --tab $TAB navigate https://example.com/

  # drive the page
  superduck --tab $TAB screenshot --output /tmp/
  superduck --tab $TAB left_click 120 240
  superduck --tab $TAB type "hello"
  superduck --tab $TAB key "cmd+a"
  superduck --tab $TAB exec "document.title"

  # observe
  superduck --tab $TAB console --pattern error --limit 20
  superduck --tab $TAB network --url-pattern /api/ --limit 10

  # active-tab shortcuts (no --tab needed)
  superduck context --full | head -50
  superduck tabs --json

Run 'superduck <command> --help' for command-specific flags.
`

const (
	ExitUsage        = 1
	ExitNotConnected = 2
	ExitToolError    = 3
	ExitTimeout      = 4
)

type globalFlags struct {
	JSON       bool
	Tab        int
	SocketPath string
	Timeout    time.Duration
}

var gflags = globalFlags{
	SocketPath: cliclient.DefaultSocketPath,
	Timeout:    30 * time.Second,
}

var errNoArgs = errors.New("no command")

// tracker is the PostHog analytics client, exposed at package level so
// individual command handlers can emit fine-grained events.
var tracker *analytics.Client

func main() {
	analytics.LibVersion = version
	analytics.EnsureInstallID()
	tracker = analytics.New(analytics.Options{RequireConfirmedID: true})
	errortrack.SetRelease(version)
	errs := errortrack.New(errortrack.Options{
		ComponentTag: "cli",
		Release:      version,
	})
	defer errs.Recover()
	commandStart := time.Now()

	if len(os.Args) < 2 {
		emitAndFlush(tracker, "_no_args", "", "", commandStart, errNoArgs)
		fmt.Fprintf(os.Stderr, usage, version, cliclient.DefaultSocketPath)
		os.Exit(ExitUsage)
	}
	args := splitGlobalFlags(os.Args[1:])
	if len(args) == 0 {
		emitAndFlush(tracker, "_no_args", "", "", commandStart, errNoArgs)
		fmt.Fprintf(os.Stderr, usage, version, cliclient.DefaultSocketPath)
		os.Exit(ExitUsage)
	}

	cmd, rest := args[0], args[1:]
	sub := extractSubcommand(cmd, rest)

	var updateCh <-chan selfupdate.CheckResult
	switch cmd {
	case "update", "version", "--version", "-v", "help", "--help", "-h":
	default:
		updateCh = selfupdate.BackgroundCheck()
	}

	var err error
	switch cmd {
	case "context":
		err = cmdContext(rest)
	case "tabs":
		err = cmdTabs(rest)
	case "tab_group":
		err = cmdTabGroup(rest)
	case "screenshot":
		err = cmdScreenshot(rest)
	case "left_click":
		err = cmdLeftClick(rest)
	case "right_click":
		err = cmdRightClick(rest)
	case "double_click":
		err = cmdDoubleClick(rest)
	case "triple_click":
		err = cmdTripleClick(rest)
	case "hover":
		err = cmdHover(rest)
	case "type":
		err = cmdTypeText(rest)
	case "key":
		err = cmdKey(rest)
	case "wait":
		err = cmdWait(rest)
	case "scroll":
		err = cmdScroll(rest)
	case "left_click_drag":
		err = cmdLeftClickDrag(rest)
	case "zoom":
		err = cmdZoom(rest)
	case "scroll_to":
		err = cmdScrollTo(rest)
	case "exec":
		err = cmdExec(rest)
	case "page_text":
		err = cmdPageText(rest)
	case "read_page":
		err = cmdReadPage(rest)
	case "form_input":
		err = cmdFormInput(rest)
	case "console":
		err = cmdConsole(rest)
	case "network":
		err = cmdNetwork(rest)
	case "resize":
		err = cmdResize(rest)
	case "navigate":
		err = cmdNavigate(rest)
	case "upload":
		err = cmdUpload(rest)
	case "shortcuts":
		err = cmdShortcuts(rest)
	case "gif":
		err = cmdGif(rest)
	case "init", "setup":
		err = cmdSetup(rest)
	case "update":
		err = cmdUpdate(rest)
	case "doctor":
		err = cmdDoctor(rest)
	case "log":
		err = cmdLog(rest)
	case "version", "--version", "-v":
		fmt.Println(version)
	case "help", "--help", "-h":
		fmt.Fprintf(os.Stderr, usage, version, cliclient.DefaultSocketPath)
	default:
		emitAndFlush(tracker, "_unknown", "", cmd, commandStart, errNoArgs)
		fmt.Fprintf(os.Stderr, "unknown command: %s\n", cmd)
		fmt.Fprintf(os.Stderr, usage, version, cliclient.DefaultSocketPath)
		os.Exit(ExitUsage)
	}

	emitAndFlush(tracker, cmd, sub, "", commandStart, err)

	if updateCh != nil {
		select {
		case result := <-updateCh:
			if hint := selfupdate.UpdateHint(version, result.Latest); hint != "" {
				fmt.Fprintln(os.Stderr, "")
				fmt.Fprintln(os.Stderr, hint)
			}
		default:
		}
	}

	if err != nil {
		errs.AddBreadcrumb(errortrack.Breadcrumb{
			Category: "cli",
			Message:  "command finished with error",
			Level:    errortrack.LevelError,
			Data: map[string]any{
				"command":     cmd,
				"subcommand":  sub,
				"json_mode":   gflags.JSON,
				"tab_present": gflags.Tab != 0,
				"duration_ms": time.Since(commandStart).Milliseconds(),
			},
		})
		errs.Capture(err, map[string]any{
			"command":    cmd,
			"subcommand": sub,
			"version":    version,
		})
		flushCtx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
		errs.Flush(flushCtx)
		cancel()
		fmt.Fprintln(os.Stderr, "error:", err)
		if errors.Is(err, cliclient.ErrNotConnected) {
			fmt.Fprintln(os.Stderr, "hint: SuperDuck native host not reachable. Make sure Chrome is running with the SuperDuck extension loaded, then try `superduck doctor`.")
		}
		os.Exit(exitCodeFor(err))
	}
}

// emitAndFlush sends one cli.command event and bounds the wait so a slow
// PostHog endpoint can never delay user-visible exit by more than 500ms.
// badCommand is non-empty only on the unknown-command path.
func emitAndFlush(tracker *analytics.Client, cmd, sub, badCommand string, start time.Time, err error) {
	props := map[string]any{
		"command":     cmd,
		"ok":          err == nil,
		"duration_ms": time.Since(start).Milliseconds(),
		"json_mode":   gflags.JSON,
		"tab_present": gflags.Tab != 0,
		"version":     version,
	}
	if sub != "" {
		props["subcommand"] = sub
	}
	if badCommand != "" {
		props["bad_command"] = badCommand
	}
	if err != nil {
		code, kind := classify(err)
		props["exit_code"] = code
		props["error_kind"] = kind
	}
	tracker.Capture("cli.command", props)
	flushCtx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	tracker.Flush(flushCtx)
	cancel()
}

// extractSubcommand pulls the second-level verb out of families that take
// one (tab_group, gif, shortcuts, navigate). Returns "" for flat commands.
func extractSubcommand(cmd string, rest []string) string {
	pickFirst := func(aliases map[string]string) string {
		if len(rest) == 0 {
			return ""
		}
		if v, ok := aliases[rest[0]]; ok {
			return v
		}
		return "unknown"
	}
	switch cmd {
	case "tab_group":
		return pickFirst(map[string]string{
			"list": "list", "ls": "list",
			"new": "new", "create": "new",
			"help": "help", "--help": "help", "-h": "help",
		})
	case "gif":
		return pickFirst(map[string]string{
			"start": "start", "stop": "stop",
			"export": "export", "clear": "clear",
		})
	case "shortcuts":
		return pickFirst(map[string]string{
			"list": "list", "ls": "list",
			"get": "get", "show": "get",
			"help": "help", "--help": "help", "-h": "help",
		})
	case "navigate":
		for _, a := range rest {
			if len(a) > 0 && a[0] == '-' {
				continue
			}
			if a == "back" || a == "forward" {
				return a
			}
			return "url"
		}
		return ""
	}
	return ""
}

// classify maps a cliclient error to (process exit code, low-cardinality label
// for PostHog). Single source of truth so the two never drift.
func classify(err error) (int, string) {
	if err == nil {
		return 0, ""
	}
	switch {
	case errors.Is(err, cliclient.ErrNotConnected):
		return ExitNotConnected, "not_connected"
	case errors.Is(err, cliclient.ErrTimeout):
		return ExitTimeout, "timeout"
	case errors.Is(err, errNoArgs):
		return ExitUsage, "usage_error"
	}
	var te *cliclient.ToolError
	if errors.As(err, &te) {
		return ExitToolError, "tool_error"
	}
	return ExitUsage, "usage_error"
}

func exitCodeFor(err error) int {
	code, _ := classify(err)
	return code
}

func clientOpts() cliclient.Options {
	return cliclient.Options{SocketPath: gflags.SocketPath, Timeout: gflags.Timeout}
}
