package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func look(found ...string) func(string) (string, error) {
	return func(name string) (string, error) {
		for _, f := range found {
			if f == name {
				return name, nil
			}
		}
		return "", errors.New("not found")
	}
}

func TestListenAddr(t *testing.T) {
	cases := []struct {
		addr  string
		allow bool
		ok    bool
	}{
		{"127.0.0.1:7681", false, true},
		{"localhost:7681", false, true},
		{"[::1]:7681", false, true},
		{"0.0.0.0:7681", false, false},
		{":7681", false, false},
		{"192.168.1.5:7681", false, false},
		{"example.com:7681", false, false},
		{"0.0.0.0:7681", true, true},
		{"7681", false, false},
	}
	for _, c := range cases {
		err := checkListenAddr(c.addr, c.allow)
		if (err == nil) != c.ok {
			t.Errorf("checkListenAddr(%q, %v) = %v, want ok=%v", c.addr, c.allow, err, c.ok)
		}
	}
}

func TestRunRefusesNonLoopback(t *testing.T) {
	if code := run([]string{"--addr", "0.0.0.0:0"}); code != 2 {
		t.Fatalf("exit code %d, want 2", code)
	}
}

func TestBuiltinProfiles(t *testing.T) {
	win := builtinProfilesFor("windows", look("pwsh.exe", "wsl.exe"), func(string) string { return "" })
	if len(win) != 2 || win[0].ID != "powershell" || win[0].Command != "pwsh.exe" || win[1].ID != "wsl" {
		t.Fatalf("windows profiles = %+v", win)
	}
	win = builtinProfilesFor("windows", look(), func(string) string { return "" })
	if len(win) != 1 || win[0].Command != "powershell.exe" || win[0].Args[0] != "-NoLogo" {
		t.Fatalf("windows fallback = %+v", win)
	}
	lin := builtinProfilesFor("linux", look("/bin/bash"), func(string) string { return "" })
	if len(lin) != 1 || lin[0].ID != "shell" || lin[0].Command != "/bin/bash" {
		t.Fatalf("linux = %+v", lin)
	}
	lin = builtinProfilesFor("linux", look(), func(k string) string { return map[string]string{"SHELL": "/bin/zsh"}[k] })
	if lin[0].Command != "/bin/zsh" {
		t.Fatalf("SHELL not used: %+v", lin)
	}
	lin = builtinProfilesFor("linux", look(), func(string) string { return "" })
	if lin[0].Command != "/bin/sh" {
		t.Fatalf("sh fallback: %+v", lin)
	}
}

func TestParseConfig(t *testing.T) {
	cfg, err := parseConfig([]byte("\xef\xbb\xbf" + `{
		"defaultProfile": "homelab",
		"profiles": [{"id": "homelab", "name": "homelab (ssh)", "command": "ssh", "args": ["me@192.168.1.10"], "env": {"A": "b"}}],
		"origins": ["HTTP://Chalk.local:8080/"],
		"hosts": ["Term:7681"]
	}`))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Origins[0] != "http://chalk.local:8080" || cfg.Hosts[0] != "term:7681" || cfg.Profiles[0].Args[0] != "me@192.168.1.10" {
		t.Fatalf("cfg = %+v", cfg)
	}
	bad := map[string]string{
		"bad json":        `{`,
		"unknown field":   `{"profilez": []}`,
		"bad id":          `{"profiles": [{"id": "a b", "name": "x", "command": "y"}]}`,
		"no name":         `{"profiles": [{"id": "a", "command": "y"}]}`,
		"no command":      `{"profiles": [{"id": "a", "name": "x"}]}`,
		"duplicate id":    `{"profiles": [{"id": "a", "name": "x", "command": "y"}, {"id": "a", "name": "x", "command": "y"}]}`,
		"id too long":     `{"profiles": [{"id": "` + strings.Repeat("a", 33) + `", "name": "x", "command": "y"}]}`,
		"profiles a list": `{"profiles": {}}`,
	}
	for name, src := range bad {
		if _, err := parseConfig([]byte(src)); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
}

func TestLoadConfigMissingFileIsFine(t *testing.T) {
	cfg, err := loadConfig(filepath.Join(t.TempDir(), "nope.json"))
	if err != nil || len(cfg.Profiles) != 0 {
		t.Fatalf("cfg=%+v err=%v", cfg, err)
	}
	path := filepath.Join(t.TempDir(), "terminal.json")
	if err := os.WriteFile(path, []byte(`{"origins": ["http://x:1"]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg, err = loadConfig(path)
	if err != nil || cfg.Origins[0] != "http://x:1" {
		t.Fatalf("cfg=%+v err=%v", cfg, err)
	}
}

func TestResolveProfiles(t *testing.T) {
	builtin := []Profile{{ID: "shell", Name: "Shell", Command: "/bin/sh"}}
	cfg := &Config{
		DefaultProfile: "homelab",
		Profiles: []Profile{
			{ID: "shell", Name: "My shell", Command: "/bin/zsh"}, // replaces the built-in
			{ID: "homelab", Name: "homelab (ssh)", Command: "ssh", Args: []string{"me@host"}},
		},
	}
	out, def, err := resolveProfiles(builtin, cfg)
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 2 || out[0].Command != "/bin/zsh" || out[1].ID != "homelab" || def != "homelab" {
		t.Fatalf("out=%+v def=%s", out, def)
	}
	if len(builtin) != 1 || builtin[0].Command != "/bin/sh" {
		t.Fatal("built-ins were modified")
	}
	_, def, _ = resolveProfiles(builtin, &Config{})
	if def != "shell" {
		t.Fatalf("default = %s", def)
	}
	if _, _, err := resolveProfiles(builtin, &Config{DefaultProfile: "ghost"}); err == nil {
		t.Fatal("unknown defaultProfile accepted")
	}
}

func TestFindProfileByIDOnly(t *testing.T) {
	ps := []Profile{{ID: "shell", Name: "Shell", Command: "/bin/sh"}}
	if _, ok := findProfile(ps, "shell"); !ok {
		t.Fatal("id lookup failed")
	}
	for _, key := range []string{"/bin/sh", "Shell", "SHELL", "", "shell "} {
		if _, ok := findProfile(ps, key); ok {
			t.Errorf("%q matched", key)
		}
	}
}

func TestExpandCwdAndEnv(t *testing.T) {
	if expandCwd("~", "/h") != "/h" || expandCwd("", "/h") != "/h" || expandCwd("/x", "/h") != "/x" {
		t.Fatal("expandCwd basics")
	}
	if got := expandCwd("~/code", "/h"); got != filepath.Join("/h", "code") {
		t.Fatalf("got %s", got)
	}
	env := buildEnv([]string{"A=1"}, Profile{Env: map[string]string{"B": "2"}})
	joined := strings.Join(env, " ")
	for _, want := range []string{"A=1", "B=2", "TERM=xterm-256color", "COLORTERM=truecolor"} {
		if !strings.Contains(joined, want) {
			t.Errorf("env missing %s: %v", want, env)
		}
	}
}
