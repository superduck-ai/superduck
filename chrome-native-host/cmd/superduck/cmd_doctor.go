package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"chrome-native-host/internal/cliclient"
)

func cmdDoctor(argv []string) error {
	fs := flag.NewFlagSet("doctor", flag.ContinueOnError)
	if err := fs.Parse(argv); err != nil {
		return err
	}

	ok := true
	var failedChecks []string
	check := func(name string, pass bool, hint string) {
		if pass {
			fmt.Printf("✓ %s\n", name)
		} else {
			fmt.Printf("✗ %s\n", name)
			if hint != "" {
				fmt.Printf("    → %s\n", hint)
			}
			ok = false
			failedChecks = append(failedChecks, name)
		}
	}

	// 1. 我自己在哪
	exe, err := os.Executable()
	check("CLI binary located", err == nil, "")
	if err == nil {
		fmt.Printf("    %s\n", exe)
	}

	// 2. native messaging manifest 文件存在 (check all supported browsers)
	if home, err := os.UserHomeDir(); err == nil {
		type browserPath struct {
			name string
			path string
		}
		var paths []browserPath
		switch runtime.GOOS {
		case "darwin":
			base := filepath.Join(home, "Library", "Application Support")
			paths = []browserPath{
				{"Chrome", filepath.Join(base, "Google", "Chrome", "NativeMessagingHosts", nativeHostName+".json")},
				{"Edge", filepath.Join(base, "Microsoft Edge", "NativeMessagingHosts", nativeHostName+".json")},
				{"Brave", filepath.Join(base, "BraveSoftware", "Brave-Browser", "NativeMessagingHosts", nativeHostName+".json")},
			}
		case "linux":
			paths = []browserPath{
				{"Chrome", filepath.Join(home, ".config", "google-chrome", "NativeMessagingHosts", nativeHostName+".json")},
				{"Edge", filepath.Join(home, ".config", "microsoft-edge", "NativeMessagingHosts", nativeHostName+".json")},
				{"Brave", filepath.Join(home, ".config", "BraveSoftware", "Brave-Browser", "NativeMessagingHosts", nativeHostName+".json")},
			}
		}
		if len(paths) == 0 {
			// Unsupported OS — skip manifest check
			check("Native messaging manifest", true, "skipped: unsupported OS")
		} else {
			var found []string
			for _, bp := range paths {
				if _, err := os.Stat(bp.path); err == nil {
					found = append(found, bp.name)
				}
			}
			passed := len(found) > 0
			if passed {
				check("Native messaging manifest", true, "")
				for _, bp := range paths {
					if _, err := os.Stat(bp.path); err == nil {
						fmt.Printf("    %s: %s\n", bp.name, bp.path)
					}
				}
			} else {
				check("Native messaging manifest", false, "run `superduck setup`")
			}
		}
	}

	// 3. UDS 可连且认证/control 协议可响应
	healthOpts := clientOpts()
	if healthOpts.Timeout > 3*time.Second {
		healthOpts.Timeout = 3 * time.Second
	}
	status, healthErr := cliclient.Health(healthOpts)
	connOK := healthErr == nil
	check("native-host UDS/auth reachable", connOK, "make sure your browser is running with the SuperDuck extension loaded")
	if connOK {
		fmt.Printf("    pid=%v chromeReady=%v socket=%v\n", status["pid"], status["chromeReady"], status["socketPath"])
	} else if healthErr != nil {
		fmt.Printf("    → %s\n", healthErr)
	}

	// 4. 扩展存活: 调一次 list_tabs
	if connOK {
		_, callErr := cliclient.CallString("superduck_list_tabs", nil, clientOpts())
		check("extension responds (superduck_list_tabs)", callErr == nil, errString(callErr))
	}

	// 5. audit dir
	ad, _ := cliclient.AuditDir()
	_, statErr := os.Stat(ad)
	check("audit dir present", statErr == nil, fmt.Sprintf("will be created on first command at %s", ad))

	if !ok {
		tracker.Capture("cli.doctor.completed", map[string]any{
			"all_passed":    false,
			"checks_failed": failedChecks,
		})
		flushCtx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
		tracker.Flush(flushCtx)
		cancel()
		fmt.Println()
		fmt.Println("doctor: some checks failed")
		os.Exit(1)
	}
	tracker.Capture("cli.doctor.completed", map[string]any{
		"all_passed": true,
	})
	fmt.Println()
	fmt.Println("doctor: all checks passed")
	return nil
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
