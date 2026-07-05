package main

import (
	"encoding/csv"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// pathListValue implements flag.Value to collect repeated --path flags.
type pathListValue []string

func (p *pathListValue) String() string { return strings.Join(*p, ",") }
func (p *pathListValue) Set(s string) error {
	*p = append(*p, s)
	return nil
}

func parsePathsCSV(csvStr string) ([]string, error) {
	r := csv.NewReader(strings.NewReader(csvStr))
	r.TrimLeadingSpace = true
	records, err := r.Read()
	if err != nil {
		return nil, fmt.Errorf("invalid --paths CSV: %w", err)
	}
	out := make([]string, 0, len(records))
	for _, p := range records {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out, nil
}

func validateUploadFilePaths(paths []string) error {
	for _, p := range paths {
		if !filepath.IsAbs(p) {
			return fmt.Errorf("path must be absolute: %s", p)
		}
		info, err := os.Stat(p)
		if err != nil {
			return fmt.Errorf("path does not exist: %s: %w", p, err)
		}
		if info.Mode()&os.ModeSymlink != 0 {
			resolved, err := filepath.EvalSymlinks(p)
			if err != nil {
				return fmt.Errorf("cannot resolve path: %s: %w", p, err)
			}
			info, err = os.Stat(resolved)
			if err != nil {
				return fmt.Errorf("path does not exist: %s: %w", p, err)
			}
		}
		if info.IsDir() {
			return fmt.Errorf("path is a directory, not a file: %s", p)
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("path is not a regular file: %s", p)
		}
	}
	return nil
}

// cmdUploadFile: superduck upload_file --tab <id> --path <p1> [--path <p2> ...] (--ref <r> | --coord x,y)
// Provide exactly one of --ref or --coord.
func cmdUploadFile(argv []string) error {
	fs := flag.NewFlagSet("upload_file", flag.ContinueOnError)
	var paths pathListValue
	fs.Var(&paths, "path", "Absolute local file path to upload (repeatable; prefer over --paths when paths contain commas)")
	pathsCSV := fs.String("paths", "", "Comma-separated absolute file paths (CSV quoting supported; use repeated --path for paths containing commas)")
	ref := fs.String("ref", "", "Element reference from read_page/find (mode 1): <input type=file>, or a <label>/<button> that controls or contains one. Mutually exclusive with --coord")
	coord := fs.String("coord", "", "Viewport x,y of a button/label that opens the native file picker (mode 2). Mutually exclusive with --ref")
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}

	allPaths := []string(paths)
	if *pathsCSV != "" {
		csvPaths, err := parsePathsCSV(*pathsCSV)
		if err != nil {
			return err
		}
		allPaths = append(allPaths, csvPaths...)
	}
	if len(allPaths) == 0 {
		return fmt.Errorf("at least one --path (or --paths) is required")
	}
	if err := validateUploadFilePaths(allPaths); err != nil {
		return err
	}
	if (*ref == "") == (*coord == "") {
		return fmt.Errorf("provide exactly one of --ref or --coord")
	}

	args := map[string]any{"paths": allPaths}
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
	return runSimpleTool("upload_file", "upload_file", args)
}
