// PMTiles v3 header and checksum inspector.
package main

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
)

type Report struct {
	File              string `json:"file"`
	Version           uint8  `json:"version"`
	MinZoom           uint8  `json:"minzoom"`
	MaxZoom           uint8  `json:"maxzoom"`
	RootDirectoryByte uint64 `json:"rootDirectoryBytes"`
	TileDataByte      uint64 `json:"tileDataBytes"`
	AddressedTiles    uint64 `json:"addressedTiles"`
	TileEntries       uint64 `json:"tileEntries"`
	TileContents      uint64 `json:"tileContents"`
	SHA256            string `json:"sha256"`
}

func u64(header []byte, offset int) uint64 {
	return binary.LittleEndian.Uint64(header[offset : offset+8])
}

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: go run native/pmtiles_inspect.go data/archive.pmtiles")
		os.Exit(2)
	}
	path := os.Args[1]
	file, err := os.Open(path)
	if err != nil {
		panic(err)
	}
	defer file.Close()

	header := make([]byte, 127)
	if _, err = io.ReadFull(file, header); err != nil {
		panic(err)
	}
	if string(header[:7]) != "PMTiles" || header[7] != 3 {
		panic("not a PMTiles v3 archive")
	}
	if _, err = file.Seek(0, io.SeekStart); err != nil {
		panic(err)
	}
	hash := sha256.New()
	if _, err = io.Copy(hash, file); err != nil {
		panic(err)
	}
	report := Report{
		File:              path,
		Version:           header[7],
		MinZoom:           header[100],
		MaxZoom:           header[101],
		RootDirectoryByte: u64(header, 16),
		TileDataByte:      u64(header, 64),
		AddressedTiles:    u64(header, 72),
		TileEntries:       u64(header, 80),
		TileContents:      u64(header, 88),
		SHA256:            hex.EncodeToString(hash.Sum(nil)),
	}
	output, _ := json.MarshalIndent(report, "", "  ")
	fmt.Println(string(output))
}
