package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	pty "github.com/aymanbagabas/go-pty"
	"github.com/coder/websocket"
)

const (
	maxSessions = 16
	maxDim      = 1000
)

// defaultOrigins are where Chalk is normally served (compose.yaml and the dev server).
var defaultOrigins = []string{
	"http://localhost:8080", "http://127.0.0.1:8080",
	"http://localhost:5173", "http://127.0.0.1:5173",
}

// Options configure a Server.
type Options struct {
	Version     string
	Port        string // the port clients use, for the Host allowlist
	Origins     []string
	Hosts       []string
	Profiles    []Profile
	Default     string
	MaxSessions int // 0 means the default of 16
}

// Server is the bridge's HTTP handler.
type Server struct {
	version  string
	origins  map[string]bool
	hosts    map[string]bool
	profiles []Profile
	def      string
	max      int
	active   atomic.Int32
}

func NewServer(o Options) *Server {
	s := &Server{
		version:  o.Version,
		origins:  map[string]bool{},
		hosts:    map[string]bool{"127.0.0.1:" + o.Port: true, "localhost:" + o.Port: true},
		profiles: o.Profiles,
		def:      o.Default,
		max:      o.MaxSessions,
	}
	if s.max <= 0 {
		s.max = maxSessions
	}
	for _, origin := range defaultOrigins {
		s.origins[origin] = true
	}
	for _, origin := range o.Origins {
		s.origins[normalizeOrigin(origin)] = true
	}
	for _, h := range o.Hosts {
		s.hosts[strings.ToLower(h)] = true
	}
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// DNS rebinding: the browser sends the attacker's hostname in Host.
	if !s.hosts[strings.ToLower(r.Host)] {
		http.Error(w, "forbidden host", http.StatusForbidden)
		return
	}
	// Cross-site pages (and other tools that forge no Origin) are refused.
	origin := strings.ToLower(r.Header.Get("Origin"))
	if origin == "" || !s.origins[origin] {
		http.Error(w, "forbidden origin", http.StatusForbidden)
		return
	}
	h := w.Header()
	h.Set("Access-Control-Allow-Origin", r.Header.Get("Origin"))
	h.Set("Vary", "Origin")
	if r.Method == http.MethodOptions {
		h.Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		h.Set("Access-Control-Allow-Headers", "Content-Type")
		h.Set("Access-Control-Max-Age", "600")
		if r.Header.Get("Access-Control-Request-Private-Network") == "true" {
			h.Set("Access-Control-Allow-Private-Network", "true")
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	switch r.URL.Path {
	case "/health":
		writeJSON(w, map[string]any{"ok": true, "version": s.version, "platform": runtime.GOOS})
	case "/profiles":
		type item struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		}
		items := make([]item, len(s.profiles))
		for i, p := range s.profiles {
			items[i] = item{p.ID, p.Name}
		}
		writeJSON(w, map[string]any{"default": s.def, "profiles": items})
	case "/session":
		s.session(w, r)
	default:
		http.NotFound(w, r)
	}
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(v)
}

func dim(q string, def int) int {
	n, err := strconv.Atoi(q)
	if err != nil || n < 1 {
		return def
	}
	if n > maxDim {
		return maxDim
	}
	return n
}

type controlMsg struct {
	Type    string `json:"type"`
	Cols    int    `json:"cols,omitempty"`
	Rows    int    `json:"rows,omitempty"`
	Code    *int   `json:"code,omitempty"`
	Message string `json:"message,omitempty"`
}

func (s *Server) session(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	id := q.Get("profile")
	if id == "" {
		id = s.def
	}
	prof, ok := findProfile(s.profiles, id)
	if !ok {
		http.Error(w, "unknown profile", http.StatusNotFound)
		return
	}
	if int(s.active.Add(1)) > s.max {
		s.active.Add(-1)
		http.Error(w, "too many sessions", http.StatusServiceUnavailable)
		return
	}
	defer s.active.Add(-1)

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		// Origin was already checked against our allowlist; the library's own
		// check only knows "same host".
		InsecureSkipVerify: true,
	})
	if err != nil {
		return
	}
	conn.SetReadLimit(1 << 20)
	origin := r.Header.Get("Origin")
	log.Printf("session start profile=%s origin=%s", prof.ID, origin)
	start := time.Now()
	s.runSession(conn, prof, dim(q.Get("cols"), 80), dim(q.Get("rows"), 24))
	log.Printf("session stop profile=%s origin=%s after %s", prof.ID, origin, time.Since(start).Round(time.Second))
}

func sendControl(ctx context.Context, conn *websocket.Conn, m controlMsg) {
	b, _ := json.Marshal(m)
	wctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	_ = conn.Write(wctx, websocket.MessageText, b)
}

func (s *Server) runSession(conn *websocket.Conn, prof Profile, cols, rows int) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	defer conn.CloseNow()

	p, err := pty.New()
	if err != nil {
		sendControl(ctx, conn, controlMsg{Type: "error", Message: "cannot create a terminal: " + err.Error()})
		conn.Close(websocket.StatusInternalError, "pty")
		return
	}
	defer p.Close()
	_ = p.Resize(cols, rows)

	home, _ := os.UserHomeDir()
	cmd := p.Command(prof.Command, prof.Args...)
	cmd.Dir = expandCwd(prof.Cwd, home)
	cmd.Env = buildEnv(os.Environ(), prof)
	prepareCmd(cmd)
	if err := cmd.Start(); err != nil {
		sendControl(ctx, conn, controlMsg{Type: "error", Message: "cannot start " + prof.Command + ": " + err.Error()})
		conn.Close(websocket.StatusInternalError, "start")
		return
	}
	defer killTree(cmd)

	waitDone := make(chan struct{})
	go func() {
		_ = cmd.Wait()
		close(waitDone)
	}()

	// socket -> pty. Any read error means the browser went away.
	go func() {
		defer cancel()
		for {
			typ, data, err := conn.Read(ctx)
			if err != nil {
				return
			}
			if typ == websocket.MessageBinary {
				if _, err := p.Write(data); err != nil {
					return
				}
				continue
			}
			var m controlMsg
			if json.Unmarshal(data, &m) == nil && m.Type == "resize" && m.Cols > 0 && m.Rows > 0 {
				_ = p.Resize(min(m.Cols, maxDim), min(m.Rows, maxDim))
			}
		}
	}()

	// pty -> socket
	var lastOut atomic.Int64
	outDone := make(chan struct{})
	go func() {
		defer close(outDone)
		buf := make([]byte, 32*1024)
		for {
			n, err := p.Read(buf)
			if n > 0 {
				lastOut.Store(time.Now().UnixNano())
				if werr := conn.Write(ctx, websocket.MessageBinary, buf[:n]); werr != nil {
					return
				}
			}
			if err != nil {
				return
			}
		}
	}()

	select {
	case <-ctx.Done():
		// Socket closed: the deferred killTree and p.Close end the process.
		return
	case <-waitDone:
	}

	// The process exited. Let the last output flush: the pty may not signal
	// EOF (the parent still holds the slave), so wait for 150ms of quiet.
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		select {
		case <-outDone:
			deadline = time.Time{}
		case <-ctx.Done():
			return
		case <-time.After(50 * time.Millisecond):
			if time.Since(time.Unix(0, lastOut.Load())) > 150*time.Millisecond {
				deadline = time.Time{}
			}
		}
	}
	code := -1
	if cmd.ProcessState != nil {
		code = cmd.ProcessState.ExitCode()
	}
	sendControl(ctx, conn, controlMsg{Type: "exit", Code: &code})
	conn.Close(websocket.StatusNormalClosure, "exit")
}
