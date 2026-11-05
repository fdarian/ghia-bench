package main

import (
	"image/png"
	"os"
	"testing"

	"github.com/egoist/mygo/ui"
)

func testApp(t *testing.T) *mailbox {
	t.Helper()
	messages, err := loadMessages("../../data/messages.json")
	if err != nil {
		t.Fatal(err)
	}
	return newMailbox(messages)
}

func snapshot(t *testing.T, tt *ui.Tester, name string) {
	t.Helper()
	dir := os.Getenv("MAILBOX_SNAPSHOT_DIR")
	if dir == "" {
		return
	}
	f, err := os.Create(dir + "/" + name + ".png")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, tt.Image()); err != nil {
		t.Fatal(err)
	}
}

func TestInitial(t *testing.T) {
	app := testApp(t)
	tt := ui.NewTester(app.view, 1280, 800)
	tt.SetScale(2)
	tt.Frame()
	snapshot(t, tt, "initial")
	if app.selected != 0 || len(app.results) != 10000 {
		t.Fatalf("selected %d, results %d", app.selected, len(app.results))
	}
}

func TestFilterAndKeys(t *testing.T) {
	app := testApp(t)
	tt := ui.NewTester(app.view, 1280, 800)
	tt.SetScale(2)
	tt.Frame()
	tt.Type("quarterly report")
	if n := len(app.results); n == 0 || n > 100 {
		t.Fatalf("quarterly report: %d results", n)
	}
	if app.selected != 0 {
		t.Fatalf("selected %d after filtering", app.selected)
	}
	snapshot(t, tt, "filtered")

	caretBefore, _ := tt.TextCaret()
	tt.Key(0, ui.KeyDown)
	tt.Key(0, ui.KeyDown)
	if app.selected != 2 {
		t.Fatalf("selected %d after two ArrowDown", app.selected)
	}
	tt.Key(0, ui.KeyUp)
	if app.selected != 1 {
		t.Fatalf("selected %d after ArrowUp", app.selected)
	}
	if caretAfter, _ := tt.TextCaret(); caretAfter != caretBefore {
		t.Fatalf("caret moved: %v -> %v", caretBefore, caretAfter)
	}
	snapshot(t, tt, "after-down")

	tt.Key(0, ui.KeyEscape)
	if app.query != "" || len(app.results) != 10000 || app.selected != 0 {
		t.Fatalf("after Escape: query %q, %d results, selected %d", app.query, len(app.results), app.selected)
	}

	tt.Type("zzzzqq")
	if len(app.results) != 0 || app.selected != -1 || !tt.HasText("No message selected") || !tt.HasText("0 conversations") {
		t.Fatalf("empty result: %d results, selected %d, texts %q", len(app.results), app.selected, tt.Texts())
	}
	snapshot(t, tt, "empty")
}

func TestSelectionScrollsIntoView(t *testing.T) {
	app := testApp(t)
	tt := ui.NewTester(app.view, 1280, 800)
	tt.Frame()
	for range 20 {
		tt.Key(0, ui.KeyDown)
	}
	first, last := app.list.Visible()
	if app.selected != 20 || app.selected < first || app.selected > last {
		t.Fatalf("selected %d, visible %d-%d", app.selected, first, last)
	}
	tt.Type("a")
	first, _ = app.list.Visible()
	if first != 0 || app.selected != 0 {
		t.Fatalf("after filter: first visible %d, selected %d", first, app.selected)
	}
}
