package main

import (
	"strings"
	"testing"
)

func TestCmdUploadImageDispatchesRefMode(t *testing.T) {
	socketPath, reqCh, wait := startFakeCLIToolServer(t, map[string]any{
		"type": "tool_response",
		"result": map[string]any{
			"content": []map[string]any{
				{"type": "text", "text": "uploaded"},
			},
		},
	})
	withCLIFlags(t, globalFlags{
		SocketPath: socketPath,
		Tab:        42,
		Timeout:    100_000_000, // 100ms
	})

	_ = captureStdout(t, func() {
		if err := cmdUpload([]string{"--image-id", "img_1", "--ref", "ref_9", "--filename", "photo.png"}); err != nil {
			t.Fatalf("cmdUpload() error = %v", err)
		}
	})

	req := <-reqCh
	wait()
	if got, want := req.Params.Tool, "upload_image"; got != want {
		t.Fatalf("tool = %q, want %q", got, want)
	}
	if got, want := req.Params.Args["imageId"], "img_1"; got != want {
		t.Fatalf("args.imageId = %v, want %v", got, want)
	}
	if got, want := req.Params.Args["ref"], "ref_9"; got != want {
		t.Fatalf("args.ref = %v, want %v", got, want)
	}
	if got, want := req.Params.Args["filename"], "photo.png"; got != want {
		t.Fatalf("args.filename = %v, want %v", got, want)
	}
	if got, want := req.Params.Args["tabId"], float64(42); got != want {
		t.Fatalf("args.tabId = %v, want %v", got, want)
	}
	if _, present := req.Params.Args["coordinate"]; present {
		t.Fatalf("args.coordinate should be absent in ref mode, got %v", req.Params.Args["coordinate"])
	}
}

func TestCmdUploadImageDispatchesCoordMode(t *testing.T) {
	socketPath, reqCh, wait := startFakeCLIToolServer(t, map[string]any{
		"type": "tool_response",
		"result": map[string]any{
			"content": []map[string]any{
				{"type": "text", "text": "uploaded"},
			},
		},
	})
	withCLIFlags(t, globalFlags{
		SocketPath: socketPath,
		Tab:        7,
		Timeout:    100_000_000,
	})

	_ = captureStdout(t, func() {
		if err := cmdUpload([]string{"--image-id", "img_1", "--coord", "500,400"}); err != nil {
			t.Fatalf("cmdUpload() error = %v", err)
		}
	})

	req := <-reqCh
	wait()
	if got, want := req.Params.Tool, "upload_image"; got != want {
		t.Fatalf("tool = %q, want %q", got, want)
	}
	coord, ok := req.Params.Args["coordinate"].([]any)
	if !ok {
		t.Fatalf("args.coordinate has type %T, want []any", req.Params.Args["coordinate"])
	}
	if len(coord) != 2 || coord[0] != float64(500) || coord[1] != float64(400) {
		t.Fatalf("args.coordinate = %v, want [500 400]", coord)
	}
	if _, present := req.Params.Args["filename"]; present {
		t.Fatalf("args.filename should be absent when --filename omitted, got %v", req.Params.Args["filename"])
	}
}

func TestCmdUploadImageRequiresImageID(t *testing.T) {
	err := cmdUpload([]string{"--ref", "ref_9"})
	if err == nil {
		t.Fatal("expected error when --image-id is omitted")
	}
	if !strings.Contains(err.Error(), "--image-id is required") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestCmdUploadImageRequiresExactlyOneOfRefOrCoord(t *testing.T) {
	cases := []struct {
		name string
		argv []string
	}{
		{"neither", []string{"--image-id", "img_1"}},
		{"both", []string{"--image-id", "img_1", "--ref", "ref_9", "--coord", "500,400"}},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			err := cmdUpload(tc.argv)
			if err == nil {
				t.Fatal("expected error when --ref/--coord are not exclusively set")
			}
			if !strings.Contains(err.Error(), "exactly one of --ref or --coord") {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestCmdUploadImageRejectsBadCoord(t *testing.T) {
	cases := []struct {
		name string
		argv []string
		want string
	}{
		{"missing-y", []string{"--image-id", "img_1", "--coord", "500"}, "--coord must be x,y"},
		{"non-numeric", []string{"--image-id", "img_1", "--coord", "x,y"}, "invalid x"},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			err := cmdUpload(tc.argv)
			if err == nil {
				t.Fatalf("expected error for %s", tc.name)
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("unexpected error: %v; want substring %q", err, tc.want)
			}
		})
	}
}
