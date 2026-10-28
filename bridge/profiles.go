package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
)

// Profile is a command the browser may start, chosen by id only.
type Profile struct {
	ID      string            `json:"id"`
	Name    string            `json:"name"`
	Command string            `json:"command"`
	Args    []string          `json:"args,omitempty"`
	Cwd     string            `json:"cwd,omitempty"`
	Env     map[string]string `json:"env,omitempty"`
}

// Config is the user's terminal.json.
type Config struct {
	DefaultProfile string    `json:"defaultProfile,omitempty"`
	Profiles       []Profile `json:"profiles,omitempty"`
	Origins        []string  `json:"origins,omitempty"`
	Hosts          []string  `json:"hosts,omitempty"`
}

var profileIDRe = regexp.MustCompile(`^[A-Za-z0-9_-]{1,32}$`)

func defaultConfigPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(".chalk", "terminal.json")
	}
	return filepath.Join(home, ".chalk", "terminal.json")
}

// loadConfig reads and validates the profiles file. A missing file is fine.
func loadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return &Config{}, nil
	}
	if err != nil {
		return nil, err
	}
	return parseConfig(data)
}

func parseConfig(data []byte) (*Config, error) {
	data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf")) // Windows editors add a BOM
	var cfg Config
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&cfg); err != nil {
		return nil, fmt.Errorf("invalid JSON: %w", err)
	}
	seen := map[string]bool{}
	for i, p := range cfg.Profiles {
		if !profileIDRe.MatchString(p.ID) {
			return nil, fmt.Errorf("profiles[%d]: id %q must be 1-32 letters, digits, - or _", i, p.ID)
		}
		if seen[p.ID] {
			return nil, fmt.Errorf("profiles[%d]: duplicate id %q", i, p.ID)
		}
		seen[p.ID] = true
		if strings.TrimSpace(p.Name) == "" {
			return nil, fmt.Errorf("profiles[%d] (%s): name is required", i, p.ID)
		}
		if strings.TrimSpace(p.Command) == "" {
			return nil, fmt.Errorf("profiles[%d] (%s): command is required", i, p.ID)
		}
	}
	for i, o := range cfg.Origins {
		cfg.Origins[i] = normalizeOrigin(o)
	}
	for i, h := range cfg.Hosts {
		cfg.Hosts[i] = strings.ToLower(strings.TrimSpace(h))
	}
	return &cfg, nil
}

func normalizeOrigin(o string) string {
	return strings.ToLower(strings.TrimRight(strings.TrimSpace(o), "/"))
}

// builtinProfiles returns the profiles for the running OS.
func builtinProfiles() []Profile {
	return builtinProfilesFor(runtime.GOOS, exec.LookPath, os.Getenv)
}

func builtinProfilesFor(goos string, lookPath func(string) (string, error), getenv func(string) string) []Profile {
	if goos == "windows" {
		ps := "powershell.exe"
		if _, err := lookPath("pwsh.exe"); err == nil {
			ps = "pwsh.exe"
		}
		out := []Profile{{ID: "powershell", Name: "PowerShell", Command: ps, Args: []string{"-NoLogo"}, Cwd: "~"}}
		if _, err := lookPath("wsl.exe"); err == nil {
			out = append(out, Profile{ID: "wsl", Name: "WSL", Command: "wsl.exe", Args: []string{"--cd", "~"}, Cwd: "~"})
		}
		return out
	}
	shell := getenv("SHELL")
	if shell == "" {
		shell = "/bin/sh"
		if _, err := lookPath("/bin/bash"); err == nil {
			shell = "/bin/bash"
		}
	}
	return []Profile{{ID: "shell", Name: "Shell", Command: shell, Cwd: "~"}}
}

// resolveProfiles merges user profiles over the built-ins (same id replaces)
// and picks the default id.
func resolveProfiles(builtin []Profile, cfg *Config) ([]Profile, string, error) {
	out := append([]Profile(nil), builtin...)
	for _, up := range cfg.Profiles {
		replaced := false
		for i := range out {
			if out[i].ID == up.ID {
				out[i] = up
				replaced = true
				break
			}
		}
		if !replaced {
			out = append(out, up)
		}
	}
	if len(out) == 0 {
		return nil, "", errors.New("no profiles available")
	}
	def := out[0].ID
	if cfg.DefaultProfile != "" {
		if _, ok := findProfile(out, cfg.DefaultProfile); !ok {
			return nil, "", fmt.Errorf("defaultProfile %q is not a known profile", cfg.DefaultProfile)
		}
		def = cfg.DefaultProfile
	}
	return out, def, nil
}

func findProfile(profiles []Profile, id string) (Profile, bool) {
	for _, p := range profiles {
		if p.ID == id {
			return p, true
		}
	}
	return Profile{}, false
}

func profileIDs(profiles []Profile) string {
	ids := make([]string, len(profiles))
	for i, p := range profiles {
		ids[i] = p.ID
	}
	return strings.Join(ids, ", ")
}

// expandCwd resolves "~", "~/x" and "" against home.
func expandCwd(cwd, home string) string {
	switch {
	case cwd == "" || cwd == "~":
		return home
	case strings.HasPrefix(cwd, "~/") || strings.HasPrefix(cwd, `~\`):
		return filepath.Join(home, cwd[2:])
	}
	return cwd
}

// buildEnv is the process environment: ours, then the profile's, then TERM.
func buildEnv(base []string, p Profile) []string {
	env := append([]string(nil), base...)
	for k, v := range p.Env {
		env = append(env, k+"="+v)
	}
	return append(env, "TERM=xterm-256color", "COLORTERM=truecolor")
}
