package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"time"

	"chrome-native-host/internal/selfupdate"
)

func cmdUpdate(argv []string) error {
	fs := flag.NewFlagSet("update", flag.ContinueOnError)
	checkOnly := fs.Bool("check", false, "Only check for updates, do not install")
	if err := fs.Parse(argv); err != nil {
		return err
	}

	fmt.Fprintf(os.Stderr, "Checking for updates...\n")
	latest, err := selfupdate.LatestVersion()
	if err != nil {
		return fmt.Errorf("failed to check for updates: %w", err)
	}

	hint := selfupdate.UpdateHint(version, latest)
	if hint == "" {
		fmt.Fprintf(os.Stderr, "superduck %s is already the latest version.\n", version)
		return nil
	}

	fmt.Fprintf(os.Stderr, "Current version: %s\nLatest version:  %s\n", version, latest)

	if *checkOnly {
		fmt.Fprintln(os.Stderr, hint)
		return nil
	}

	method, err := selfupdate.DetectInstallMethod()
	if err != nil {
		return fmt.Errorf("could not determine install method: %w", err)
	}

	var installedVersion string
	switch method {
	case selfupdate.InstallNPM:
		fmt.Fprintf(os.Stderr, "Detected npm install. Running npm install -g superduck-cli@latest...\n")
		newVer, err := selfupdate.UpdateViaNPM(os.Stderr)
		if err != nil {
			return fmt.Errorf("npm update failed: %w", err)
		}
		if newVer != "" {
			installedVersion = newVer
		} else {
			installedVersion = latest
		}
		fmt.Fprintf(os.Stderr, "\n✓ Updated to superduck %s\n", installedVersion)

	case selfupdate.InstallBinary:
		fmt.Fprintf(os.Stderr, "Detected direct binary install. Downloading v%s from GitHub...\n", latest)
		if err := selfupdate.UpdateViaBinary(latest, os.Stderr); err != nil {
			return fmt.Errorf("binary update failed: %w", err)
		}
		installedVersion = latest
		fmt.Fprintf(os.Stderr, "\n✓ Updated to superduck %s\n", installedVersion)
	}

	selfupdate.WriteCacheNow(installedVersion)

	tracker.Capture("cli.update.completed", map[string]any{
		"from_version":   version,
		"to_version":     installedVersion,
		"install_method": method.String(),
	})
	flushCtx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	tracker.Flush(flushCtx)
	cancel()

	return nil
}
