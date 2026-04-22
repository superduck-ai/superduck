package main

import (
	"flag"
	"fmt"
	"strconv"
	"strings"
)

// cmdUpload: superduck upload --tab <id> --image-id <id> (--ref R | --coord x,y) [--filename N]
func cmdUpload(argv []string) error {
	fs := flag.NewFlagSet("upload", flag.ContinueOnError)
	imageID := fs.String("image-id", "", "Screenshot/image ID returned by `screenshot`")
	ref := fs.String("ref", "", "Element reference ID (e.g. file input)")
	coord := fs.String("coord", "", "Drop target coordinates as x,y")
	filename := fs.String("filename", "", "Optional uploaded filename (default image.png)")
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}
	if *imageID == "" {
		return fmt.Errorf("--image-id is required")
	}
	if (*ref == "") == (*coord == "") {
		return fmt.Errorf("provide exactly one of --ref or --coord")
	}
	args := map[string]any{"imageId": *imageID}
	if *ref != "" {
		args["ref"] = *ref
	} else {
		parts := strings.Split(*coord, ",")
		if len(parts) != 2 {
			return fmt.Errorf("--coord must be x,y")
		}
		x, err := strconv.ParseFloat(strings.TrimSpace(parts[0]), 64)
		if err != nil {
			return fmt.Errorf("invalid x: %v", err)
		}
		y, err := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
		if err != nil {
			return fmt.Errorf("invalid y: %v", err)
		}
		args["coordinate"] = []float64{x, y}
	}
	if *filename != "" {
		args["filename"] = *filename
	}
	return runSimpleTool("upload_image", "upload", args)
}
