package main

import (
	"flag"
	"fmt"
)

// cmdGif: superduck gif <start|stop|export|clear> --tab <id> [export flags]
func cmdGif(argv []string) error {
	if len(argv) == 0 {
		return fmt.Errorf("usage: superduck gif <start|stop|export|clear> --tab <id> [--download] [--filename N] [--no-* ...] [--quality N]")
	}
	sub, rest := argv[0], argv[1:]
	action := ""
	switch sub {
	case "start":
		action = "start_recording"
	case "stop":
		action = "stop_recording"
	case "export":
		action = "export"
	case "clear":
		action = "clear"
	default:
		return fmt.Errorf("unknown gif subcommand: %s", sub)
	}

	fs := flag.NewFlagSet("gif "+sub, flag.ContinueOnError)
	download := fs.Bool("download", false, "Export: trigger browser download")
	filename := fs.String("filename", "", "Export filename")
	noClick := fs.Bool("no-click-indicators", false, "Disable click indicators overlay")
	noDrag := fs.Bool("no-drag-paths", false, "Disable drag path arrows")
	noLabels := fs.Bool("no-action-labels", false, "Disable action labels")
	noProgress := fs.Bool("no-progress-bar", false, "Disable progress bar")
	noWatermark := fs.Bool("no-watermark", false, "Disable SuperDuck watermark")
	quality := fs.Int("quality", 0, "GIF quality (1-30, lower = better)")
	if err := fs.Parse(reorderFlagsFirst(rest)); err != nil {
		return err
	}

	args := map[string]any{"action": action}
	if action == "export" {
		if *download {
			args["download"] = true
		}
		if *filename != "" {
			args["filename"] = *filename
		}
		opts := map[string]any{}
		if *noClick {
			opts["showClickIndicators"] = false
		}
		if *noDrag {
			opts["showDragPaths"] = false
		}
		if *noLabels {
			opts["showActionLabels"] = false
		}
		if *noProgress {
			opts["showProgressBar"] = false
		}
		if *noWatermark {
			opts["showWatermark"] = false
		}
		if *quality > 0 {
			opts["quality"] = *quality
		}
		if len(opts) > 0 {
			args["options"] = opts
		}
	}
	return runSimpleTool("gif_creator", "gif "+sub, args)
}
