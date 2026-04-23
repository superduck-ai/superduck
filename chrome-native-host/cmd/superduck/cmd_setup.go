package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// Native messaging host name. Must match the allowed list in service-worker.ts.
const nativeHostName = "com.me.superduck_browser_extension"

// Pinned extension ID — derived from the public "key" field baked into
// chrome-crx/manifest.json. Same ID regardless of how the extension is loaded
// (Web Store, load-unpacked, dev), so `superduck init` works without flags.
const defaultExtensionID = "onpjjodappojoekckagpfjckoamcmhbn"

type nmManifest struct {
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	Path           string   `json:"path"`
	Type           string   `json:"type"`
	AllowedOrigins []string `json:"allowed_origins"`
}

func cmdSetup(argv []string) error {
	fs := flag.NewFlagSet("setup", flag.ContinueOnError)
	binaryPath := fs.String("binary", "", "Path to chrome-native-host binary (default: detect ~/bin or build/)")
	browser := fs.String("browser", "all", "Which browser(s): chrome|edge|brave|all")
	extensionID := fs.String("extension-id", defaultExtensionID, "SuperDuck extension ID. Defaults to the pinned ID baked into manifest.json.")
	if err := fs.Parse(argv); err != nil {
		return err
	}

	nhPath, err := findNativeHost(*binaryPath)
	if err != nil {
		return fmt.Errorf("could not locate chrome-native-host binary: %w. Use --binary <path>", err)
	}
	fmt.Fprintf(os.Stderr, "native-host binary: %s\n", nhPath)

	allowed := []string{"chrome-extension://" + *extensionID + "/"}

	manifest := nmManifest{
		Name:           nativeHostName,
		Description:    "SuperDuck native messaging host",
		Path:           nhPath,
		Type:           "stdio",
		AllowedOrigins: allowed,
	}

	dirs, err := nativeMessagingDirs(*browser)
	if err != nil {
		return err
	}

	written := 0
	for _, d := range dirs {
		if err := os.MkdirAll(d, 0o755); err != nil {
			fmt.Fprintf(os.Stderr, "skip %s: %v\n", d, err)
			continue
		}
		path := filepath.Join(d, nativeHostName+".json")
		f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
		if err != nil {
			fmt.Fprintf(os.Stderr, "skip %s: %v\n", path, err)
			continue
		}
		enc := json.NewEncoder(f)
		enc.SetIndent("", "  ")
		if err := enc.Encode(manifest); err != nil {
			f.Close()
			return err
		}
		f.Close()
		fmt.Fprintf(os.Stderr, "wrote %s\n", path)
		written++
	}

	if written == 0 {
		return fmt.Errorf("no manifest written. Check --browser and that the directories are writable")
	}

	if *extensionID == defaultExtensionID {
		fmt.Fprintln(os.Stderr)
		fmt.Fprintf(os.Stderr, "ℹ  using pinned extension id: %s\n", defaultExtensionID)
	}
	fmt.Fprintln(os.Stderr)
	fmt.Fprintln(os.Stderr, "✓ init complete. Next:")
	fmt.Fprintln(os.Stderr, "   1. Install the SuperDuck extension in Chrome (Web Store or load-unpacked)")
	fmt.Fprintln(os.Stderr, "   2. Run `superduck doctor` — all green means you're ready")
	return nil
}

func findNativeHost(override string) (string, error) {
	if override != "" {
		return filepath.Abs(override)
	}
	candidates := []string{}
	// 1) Same directory as this binary (npm install case: sibling in platform sub-package).
	if exe, err := os.Executable(); err == nil {
		if resolved, rerr := filepath.EvalSymlinks(exe); rerr == nil {
			exe = resolved
		}
		dir := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(dir, "chrome-native-host"),
			filepath.Join(dir, "chrome-native-host.exe"),
			filepath.Join(dir, "..", "build", "chrome-native-host"),
		)
	}
	// 2) Legacy manual install location.
	if home, err := os.UserHomeDir(); err == nil {
		candidates = append(candidates, filepath.Join(home, "bin", "chrome-native-host"))
	}
	// 3) Dev: run from repo root.
	if cwd, err := os.Getwd(); err == nil {
		candidates = append(candidates, filepath.Join(cwd, "build", "chrome-native-host"))
	}
	for _, c := range candidates {
		if abs, err := filepath.Abs(c); err == nil {
			if st, err := os.Stat(abs); err == nil && !st.IsDir() {
				return abs, nil
			}
		}
	}
	return "", fmt.Errorf("not found in: %s", strings.Join(candidates, ", "))
}

func nativeMessagingDirs(browser string) ([]string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	browser = strings.ToLower(browser)
	wantAll := browser == "all" || browser == ""
	var dirs []string
	switch runtime.GOOS {
	case "darwin":
		base := filepath.Join(home, "Library", "Application Support")
		if wantAll || browser == "chrome" {
			dirs = append(dirs, filepath.Join(base, "Google", "Chrome", "NativeMessagingHosts"))
		}
		if wantAll || browser == "edge" {
			dirs = append(dirs, filepath.Join(base, "Microsoft Edge", "NativeMessagingHosts"))
		}
		if wantAll || browser == "brave" {
			dirs = append(dirs, filepath.Join(base, "BraveSoftware", "Brave-Browser", "NativeMessagingHosts"))
		}
	case "linux":
		if wantAll || browser == "chrome" {
			dirs = append(dirs, filepath.Join(home, ".config", "google-chrome", "NativeMessagingHosts"))
		}
		if wantAll || browser == "edge" {
			dirs = append(dirs, filepath.Join(home, ".config", "microsoft-edge", "NativeMessagingHosts"))
		}
		if wantAll || browser == "brave" {
			dirs = append(dirs, filepath.Join(home, ".config", "BraveSoftware", "Brave-Browser", "NativeMessagingHosts"))
		}
	case "windows":
		return nil, fmt.Errorf("windows setup not yet automated; see VISION.md and write the registry key manually")
	default:
		return nil, fmt.Errorf("unsupported OS: %s", runtime.GOOS)
	}
	return dirs, nil
}
