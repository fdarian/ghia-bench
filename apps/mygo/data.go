package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"unicode/utf16"

	"github.com/egoist/mygo/ui"
)

var avatarColors = [8]ui.Color{
	ui.Hex("#F87171"), ui.Hex("#FB923C"), ui.Hex("#FBBF24"), ui.Hex("#34D399"),
	ui.Hex("#22D3EE"), ui.Hex("#60A5FA"), ui.Hex("#A78BFA"), ui.Hex("#F472B6"),
}

type message struct {
	ID        int      `json:"id"`
	FromName  string   `json:"fromName"`
	FromEmail string   `json:"fromEmail"`
	Subject   string   `json:"subject"`
	Snippet   string   `json:"snippet"`
	Body      []string `json:"body"`
	Time      string   `json:"time"`
	DateLong  string   `json:"dateLong"`
	Unread    bool     `json:"unread"`

	initials string
	avatar   ui.Color
	haystack string
}

func loadMessages(path string) ([]message, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading messages: %w", err)
	}
	var messages []message
	if err := json.Unmarshal(raw, &messages); err != nil {
		return nil, fmt.Errorf("parsing %s: %w", path, err)
	}
	for i := range messages {
		m := &messages[i]
		m.initials = initials(m.FromName)
		m.avatar = avatarColors[nameHash(m.FromName)%8]
		m.haystack = strings.ToLower(m.FromName + " " + m.Subject + " " + m.Snippet)
	}
	return messages, nil
}

func initials(name string) string {
	var out strings.Builder
	for i, word := range strings.Fields(name) {
		if i == 2 {
			break
		}
		for _, r := range word {
			out.WriteRune(r)
			break
		}
	}
	return out.String()
}

func nameHash(name string) uint32 {
	var sum uint32
	for _, unit := range utf16.Encode([]rune(name)) {
		sum += uint32(unit)
	}
	return sum
}

func withThousands(n int) string {
	digits := fmt.Sprint(n)
	var out strings.Builder
	for i, digit := range digits {
		if i > 0 && (len(digits)-i)%3 == 0 {
			out.WriteByte(',')
		}
		out.WriteRune(digit)
	}
	return out.String()
}
