package fileserver

import "os"

func mkdirAllOS(path string, perm uint32) error {
	return os.MkdirAll(path, os.FileMode(perm))
}

func writeFileOS(path string, data []byte, perm uint32) error {
	return os.WriteFile(path, data, os.FileMode(perm))
}

func renameOS(old, new string) error {
	return os.Rename(old, new)
}

func removeOS(path string) error {
	return os.Remove(path)
}
