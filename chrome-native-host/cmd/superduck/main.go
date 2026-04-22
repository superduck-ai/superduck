package main

import (
	"errors"
	"fmt"
	"os"
	"time"

	"chrome-native-host/internal/cliclient"
)

const version = "0.2.1"

const usage = `superduck %s — your browser's session, callable as a tool.

USAGE:
  superduck <command> [flags]

COMMANDS:
  init              Install native messaging manifest and start native-host (run once after npm install)
  context           Read url/title/selection/text from the current active Chrome tab
  fetch <url>       HTTP request using current Chrome's cookies (default same eTLD+1)
  tabs              List all Chrome tabs
  group <sub>       MCP tab group ops (context [--create] | create)
  open <url>        Navigate the active tab to a URL
  screenshot --tab <id> [--output PATH]  Capture a screenshot (PNG/JPEG)
  click             Click an element by --selector or --text (or positional <text>)
  fill <sel> <val>  Set the value of a form field and dispatch input/change events
  press <key>       Dispatch a keyboard event (Enter, Tab, Escape, ArrowDown, ...)

MOUSE/KEYBOARD (all require --tab <id>):
  left_click <x> <y> [--modifiers M] [--ref R]
  right_click <x> <y> [--modifiers M] [--ref R]
  double_click <x> <y> [--modifiers M] [--ref R]
  triple_click <x> <y> [--modifiers M] [--ref R]
  hover <x> <y> [--ref R]
  type <text>
  key "<keys>" [--repeat N]
  wait <seconds>
  scroll <x> <y> --direction <up|down|left|right> [--amount N]
  left_click_drag <x1> <y1> <x2> <y2>
  zoom <x0> <y0> <x1> <y1> [--output PATH]
  scroll_to --ref <refId>

PAGE / DOM:
  exec <js> | --file PATH | --stdin       Eval JS in page (no 'return')
  page_text                               Extract main article text
  find "<query>"                          Natural-language element search
  read_page [--filter interactive|all] [--depth N] [--ref R] [--max-chars N]
  form_input --ref <r> --value <v> [--string]

OBSERVABILITY:
  console [--pattern P] [--only-errors] [--clear] [--limit N]
  network [--url-pattern P] [--clear] [--limit N]

WINDOW / NAV:
  resize <w> <h>
  navigate <url|back|forward>

UPLOAD / SHORTCUTS / GIF:
  upload --image-id <id> (--ref R | --coord x,y) [--filename N]
  shortcuts <list|execute --id I --command C>
  gif <start|stop|export|clear> [--download] [--filename N] [--no-* ...] [--quality N]

  doctor            Health check: binary, manifest, native-host, extension
  log               Show audit log (~/.superduck/audit.jsonl)
  version           Print version

GLOBAL FLAGS:
  --json            Machine-readable output (stdout = single JSON object)
  --tab <id>        Override active-tab resolution
  --socket <path>   UDS path (default %s)
  --timeout <s>     Per-request timeout in seconds (default 30)

EXAMPLES:
  superduck context
  superduck context --full | head -50
  superduck fetch https://api.example.com/me
  superduck fetch https://other.com/x --allow-cross-origin
  superduck tabs --json
  superduck group context --create
  superduck group create
  superduck open https://www.bilibili.com/
  superduck screenshot --tab 123 --output /tmp/
  superduck click "Login"
  superduck click --selector 'button[type=submit]'
  superduck fill 'input[name=q]' "claude code"
  superduck press Enter
  superduck log --tail 5

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

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintf(os.Stderr, usage, version, cliclient.DefaultSocketPath)
		os.Exit(ExitUsage)
	}
	args := splitGlobalFlags(os.Args[1:])
	if len(args) == 0 {
		fmt.Fprintf(os.Stderr, usage, version, cliclient.DefaultSocketPath)
		os.Exit(ExitUsage)
	}

	cmd, rest := args[0], args[1:]
	var err error
	switch cmd {
	case "context":
		err = cmdContext(rest)
	case "fetch":
		err = cmdFetch(rest)
	case "tabs":
		err = cmdTabs(rest)
	case "group":
		err = cmdGroup(rest)
	case "open":
		err = cmdOpen(rest)
	case "screenshot":
		err = cmdScreenshot(rest)
	case "click":
		err = cmdClick(rest)
	case "fill":
		err = cmdFill(rest)
	case "press":
		err = cmdPress(rest)
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
	case "find":
		err = cmdFind(rest)
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
	case "doctor":
		err = cmdDoctor(rest)
	case "log":
		err = cmdLog(rest)
	case "version", "--version", "-v":
		fmt.Println(version)
	case "help", "--help", "-h":
		fmt.Fprintf(os.Stderr, usage, version, cliclient.DefaultSocketPath)
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n", cmd)
		fmt.Fprintf(os.Stderr, usage, version, cliclient.DefaultSocketPath)
		os.Exit(ExitUsage)
	}

	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(classifyExit(err))
	}
}

func classifyExit(err error) int {
	if errors.Is(err, cliclient.ErrNotConnected) {
		fmt.Fprintln(os.Stderr, "hint: SuperDuck native host not reachable. Make sure Chrome is running with the SuperDuck extension loaded, then try `superduck doctor`.")
		return ExitNotConnected
	}
	if errors.Is(err, cliclient.ErrTimeout) {
		return ExitTimeout
	}
	var te *cliclient.ToolError
	if errors.As(err, &te) {
		return ExitToolError
	}
	return ExitUsage
}

func clientOpts() cliclient.Options {
	return cliclient.Options{SocketPath: gflags.SocketPath, Timeout: gflags.Timeout}
}
