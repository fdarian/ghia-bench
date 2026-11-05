// Mailbox on MyGo's native UI: package ui draws the window on the GPU, no web view.
package main

import (
	"log"
	"path/filepath"
	"strings"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/ui"
)

var (
	ink        = ui.Hex("#18181B")
	zinc200    = ui.Hex("#E4E4E7")
	zinc100    = ui.Hex("#F4F4F5")
	muted      = ui.Hex("#71717A")
	subtle     = ui.Hex("#A1A1AA")
	white      = ui.Hex("#FFFFFF")
	blue       = ui.Hex("#2563EB")
	selectedBg = ui.Hex("#DBEAFE")
)

type folder struct {
	name  string
	count int
}

// The Inbox count is the unread total, filled in once the messages are loaded.
var folders = []folder{
	{"Inbox", -1}, {"Starred", 24}, {"Sent", 128}, {"Drafts", 3},
	{"Archive", 2048}, {"Spam", 12}, {"Trash", 0},
}

type label struct {
	name  string
	color ui.Color
}

var labels = []label{
	{"Work", ui.Hex("#2563EB")}, {"Personal", ui.Hex("#16A34A")},
	{"Finance", ui.Hex("#CA8A04")}, {"Travel", ui.Hex("#9333EA")},
	{"Family", ui.Hex("#DB2777")}, {"Receipts", ui.Hex("#EA580C")},
	{"Newsletters", ui.Hex("#0891B2")}, {"Projects", ui.Hex("#4F46E5")},
}

type mailbox struct {
	messages []message
	unread   int

	query    string
	results  []int // indices into messages
	selected int   // position in results, -1 for none

	list   ui.ListState
	detail ui.ScrollState
	search ui.Handle
	theme  *ui.Theme
}

func newMailbox(messages []message) *mailbox {
	a := &mailbox{messages: messages, theme: newTheme()}
	for i := range messages {
		if messages[i].Unread {
			a.unread++
		}
	}
	a.refilter()
	return a
}

func newTheme() *ui.Theme {
	t := ui.LightTheme()
	t.Background = white
	t.Text = ink
	t.FontSize = 13
	// The caret is painted in the accent colour.
	t.Accent = ink
	return t
}

func (a *mailbox) refilter() {
	query := strings.ToLower(strings.TrimSpace(a.query))
	a.results = a.results[:0]
	for i := range a.messages {
		if query == "" || strings.Contains(a.messages[i].haystack, query) {
			a.results = append(a.results, i)
		}
	}
	a.selected = -1
	if len(a.results) > 0 {
		a.selected = 0
	}
	a.list.ScrollTo(0, ui.Start)
	a.detail.Y = 0
}

func (a *mailbox) selectRow(position int) {
	a.selected = position
	a.detail.Y = 0
}

func (a *mailbox) moveSelection(delta int) {
	if len(a.results) == 0 {
		return
	}
	next := min(max(a.selected+delta, 0), len(a.results)-1)
	a.selectRow(next)
	a.list.ScrollIntoView(next)
}

func (a *mailbox) searchKey(k ui.TextKey) bool {
	if k.Mods != 0 {
		return false
	}
	switch k.Key {
	case ui.KeyDown:
		a.moveSelection(1)
		return true
	case ui.KeyUp:
		a.moveSelection(-1)
		return true
	case ui.KeyEscape:
		k.SetText("")
		a.query = ""
		a.refilter()
		return true
	}
	return false
}

func (a *mailbox) view(c *ui.Context) {
	c.SetTheme(a.theme)
	ui.Row(c).Fill().AlignItems(ui.Stretch).Children(func() {
		a.sidebar(c)
		a.listColumn(c)
		a.detailPane(c)
	})
}

func (a *mailbox) sidebar(c *ui.Context) {
	ui.Column(c.Key("sidebar")).Width(220).Shrink(0).Background(zinc100).
		BorderWidth(0, 1, 0, 0).BorderColor(zinc200).Children(func() {
		ui.Row(c).Height(48).Shrink(0).PaddingStart(16).Children(func() {
			ui.Text(c, "Mailbox").FontSize(15).FontWeight(600).TextColor(ink)
		})
		ui.Column(c).Padding(8, 8, 0, 8).Children(func() {
			for _, f := range folders {
				a.folderRow(c, f)
			}
		})
		ui.Row(c).Height(24).Margin(16, 0, 0, 0).PaddingStart(16).Children(func() {
			ui.Text(c, "LABELS").FontSize(11).FontWeight(600).TextColor(subtle).LetterSpacing(0.5)
		})
		ui.Column(c).Padding(0, 8).Children(func() {
			for _, l := range labels {
				ui.Row(c.Key(l.name)).Height(28).PaddingX(8).Gap(8).Children(func() {
					ui.Box(c).Size(8, 8).Radius(4).Background(l.color).Shrink(0)
					ui.Text(c, l.name).FontSize(13).FixedLineHeight(18).TextColor(ui.Hex("#3F3F46"))
				})
			}
		})
	})
}

func (a *mailbox) folderRow(c *ui.Context, f folder) {
	row := ui.Row(c.Key(f.name)).Height(32).PaddingX(8).Radius(6).Justify(ui.SpaceBetween)
	switch {
	case f.name == "Inbox":
		row.Background(zinc200)
	case row.Hovered():
		row.Background(ui.Hex("#EBEBED"))
	}
	row.Children(func() {
		ui.Text(c, f.name).FontSize(13).FixedLineHeight(18).TextColor(ui.Hex("#27272A"))
		count := f.count
		if f.name == "Inbox" {
			count = a.unread
		}
		if count > 0 {
			ui.Text(c, withThousands(count)).FontSize(12).TextColor(muted)
		}
	})
}

func (a *mailbox) listColumn(c *ui.Context) {
	ui.Column(c.Key("list-column")).Width(420).Shrink(0).Background(white).
		BorderWidth(0, 1, 0, 0).BorderColor(zinc200).Children(func() {
		ui.Box(c).Height(56).Shrink(0).Padding(12, 0, 0, 12).Children(func() {
			a.searchField(c)
		})
		ui.Row(c).Height(28).Shrink(0).PaddingStart(16).Children(func() {
			ui.Text(c, withThousands(len(a.results))+" conversations").FontSize(12).TextColor(muted)
		})
		ui.List(c, &a.list, len(a.results)).Grow(1).FocusRing(false).Rows(func(row ui.ListRow) {
			a.messageRow(row)
		})
	})
}

func (a *mailbox) searchField(c *ui.Context) {
	border := zinc200
	if a.search.Focused(c) {
		border = blue
	}
	ui.Row(c.Key("search-box")).Width(396).Height(32).PaddingX(10).Radius(8).
		Background(zinc100).Border(1, border).Children(func() {
		ui.TextInputBase(c.Key("search"), &a.query).Bind(&a.search).AutoFocus().
			Label("Search mail").Placeholder("Search mail").PlaceholderColor(subtle).
			FontSize(13).TextColor(ink).FocusRing(false).Grow(1).
			OnChange(a.refilter).OnTextKey(a.searchKey)
	})
}

func (a *mailbox) messageRow(row ui.ListRow) {
	c := row.Context
	m := &a.messages[a.results[row.Index]]
	position := row.Index
	root := ui.Box(c).Height(72).Shrink(0).KeepFocus().OnClick(func() { a.selectRow(position) })
	switch {
	case position == a.selected:
		root.Background(selectedBg)
	case root.Hovered():
		root.Background(zinc100)
	}
	root.Children(func() {
		if m.Unread {
			ui.Box(c).Absolute().Left(4).Top(17).Size(8, 8).Radius(4).Background(blue)
		}
		avatar(c, m, 36, 13).Absolute().Left(16).Top(12)
		ui.Column(c).Absolute().Left(64).Right(16).Top(12).Children(func() {
			ui.Row(c).Height(18).Justify(ui.SpaceBetween).Children(func() {
				name := ui.Text(c, m.FromName).FontSize(13).FixedLineHeight(18).SingleLine().Grow(1).MinWidth(0)
				if m.Unread {
					name.FontWeight(600).TextColor(ink)
				} else {
					name.FontWeight(500).TextColor(ui.Hex("#3F3F46"))
				}
				ui.Text(c, m.Time).FontSize(12).FixedLineHeight(18).TextColor(muted).Shrink(0).
					Margin(0, 0, 0, 8).NoWrap()
			})
			ui.Text(c, m.Subject).FontSize(13).FixedLineHeight(18).Height(18).SingleLine().
				TextColor(ui.Hex("#27272A"))
			ui.Text(c, m.Snippet).FontSize(12).FixedLineHeight(16).Height(16).SingleLine().TextColor(muted)
		})
		ui.Box(c).Absolute().Left(0).Right(0).Bottom(0).Height(1).Background(zinc100)
	})
}

func avatar(c *ui.Context, m *message, diameter, fontSize float32) ui.Element {
	box := ui.Box(c).Size(diameter, diameter).Shrink(0).Radius(diameter / 2).Background(m.avatar).Center()
	box.Children(func() {
		ui.Text(c, m.initials).FontSize(fontSize).FixedLineHeight(fontSize + 3).FontWeight(600).
			TextColor(white).NoWrap()
	})
	return box
}

func (a *mailbox) detailPane(c *ui.Context) {
	pane := ui.Column(c.Key("detail-pane")).Grow(1).MinWidth(0).Background(white)
	if a.selected < 0 {
		pane.Center().Children(func() {
			ui.Text(c, "No message selected").FontSize(14).TextColor(subtle)
		})
		return
	}
	m := &a.messages[a.results[a.selected]]
	pane.Children(func() {
		ui.Scroll(c.Key("detail")).Grow(1).Padding(32).TrackScroll(&a.detail).Children(func() {
			ui.Text(c, m.Subject).FontSize(22).FixedLineHeight(28).FontWeight(600).TextColor(ink)
			ui.Row(c).Height(40).Shrink(0).Margin(16, 0, 0, 0).AlignItems(ui.Start).Children(func() {
				avatar(c, m, 40, 15)
				ui.Column(c).Grow(1).MinWidth(0).Height(40).Margin(0, 0, 0, 12).Justify(ui.Center).Children(func() {
					ui.Text(c, m.FromName).FontSize(14).FixedLineHeight(20).FontWeight(600).TextColor(ink)
					ui.Text(c, m.FromEmail).FontSize(13).FixedLineHeight(20).TextColor(muted)
				})
				ui.Text(c, m.DateLong).FontSize(12).FixedLineHeight(16).TextColor(muted).Shrink(0).NoWrap()
			})
			ui.Column(c).Margin(24, 0, 0, 0).Gap(14).Children(func() {
				for i, paragraph := range m.Body {
					ui.Text(c.Key(i), paragraph).FontSize(14).FixedLineHeight(22).TextColor(ui.Hex("#27272A"))
				}
			})
		})
	})
}

func main() {
	var app *mailbox
	mygo.App.WhenReady(func() {
		resources, err := mygo.App.Path(mygo.PathResources)
		if err != nil {
			log.Fatal(err)
		}
		messages, err := loadMessages(filepath.Join(resources, "messages.json"))
		if err != nil {
			log.Fatal(err)
		}
		app = newMailbox(messages)
		mygo.NewWindow(mygo.WindowOptions{
			Title:          "Mailbox",
			Width:          1280,
			Height:         800,
			UseContentSize: true,
			X:              100,
			Y:              100,
			Content:        ui.View(app.view),
		})
	})
	if err := mygo.App.Run(); err != nil {
		log.Fatal(err)
	}
}
