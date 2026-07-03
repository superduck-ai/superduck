package main

import (
	"flag"
	"fmt"
	"path/filepath"
)

// cmdFileUpload: `superduck file_upload --tab <id> --ref <R> <path> [path...]`.
//
// Uploads one or more local files (absolute paths) into a file <input> element
// on the page. Unlike `upload` (which drops a previously captured screenshot
// identified by --image-id), this streams real local files: the extension
// forwards the paths to CDP DOM.setFileInputFiles, which Chrome reads directly
// from disk — no native-host file reading is required.
//
// Locate the file input with read_page/find and pass its ref. Do NOT click the
// input: that opens a native file-picker dialog the CLI cannot drive.
func cmdFileUpload(argv []string) error {
	fs := flag.NewFlagSet("file_upload", flag.ContinueOnError)
	ref := fs.String("ref", "", "Element reference ID of the file input (from read_page/find)")
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}
	if *ref == "" {
		return fmt.Errorf("--ref is required (the file input element ref from read_page/find)")
	}
	paths := fs.Args()
	if len(paths) == 0 {
		return fmt.Errorf("at least one absolute file path is required")
	}
	for _, path := range paths {
		if !filepath.IsAbs(path) {
			return fmt.Errorf("file_upload paths must be absolute: %q", path)
		}
	}
	args := map[string]any{
		"paths": paths,
		"ref":   *ref,
	}
	return runSimpleTool("file_upload", "file_upload", args)
}
