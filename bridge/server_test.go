//go:build !windows

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"runtime"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/coder/websocket"
)

const testOrigin = "http://localhost:8080"

type testBridge struct {
	srv  *httptest.Server
	host string // 127.0.0.1:port
}

func newBridge(t *testing.T, o Options) *testBridge {
	t.Helper()
	ts := httptest.NewUnstartedServer(nil)
	port := fmt.Sprint(ts.Listener.Addr().(*net.TCPAddr).Port)
	o.Port = port
	if o.Profiles == nil {
		o.Profiles = builtinProfiles()
		o.Default = o.Profiles[0].ID
	}
	ts.Config.Handler = NewServer(o)
	ts.Start()
	t.Cleanup(ts.Close)
	return &testBridge{srv: ts, host: "127.0.0.1:" + port}
}

func (b *testBridge) get(t *testing.T, path, host, origin string) *http.Response {
	t.Helper()
	req, _ := http.NewRequest("GET", b.srv.URL+path, nil)
	if host != "" {
		req.Host = host
	}
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { res.Body.Close() })
	return res
}

func (b *testBridge) dial(t *testing.T, query string) (*websocket.Conn, *http.Response, error) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	c, res, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(b.srv.URL, "http")+"/session?"+query, &websocket.DialOptions{
		HTTPHeader: http.Header{"Origin": {testOrigin}},
	})
	if c != nil {
		t.Cleanup(func() { c.CloseNow() })
	}
	return c, res, err
}

// readUntil collects binary output until it contains want; a text frame is
// returned as ctl (the output so far is still returned).
func readUntil(t *testing.T, c *websocket.Conn, want string) (out string, ctl *controlMsg) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	for want == "" || !strings.Contains(out, want) {
		typ, data, err := c.Read(ctx)
		if err != nil {
			if want == "" {
				return out, nil
			}
			t.Fatalf("waiting for %q, got %q: %v", want, out, err)
		}
		if typ == websocket.MessageText {
			var m controlMsg
			if err := json.Unmarshal(data, &m); err != nil {
				t.Fatalf("bad control frame %q", data)
			}
			return out, &m
		}
		out += string(data)
	}
	return out, nil
}

func send(t *testing.T, c *websocket.Conn, s string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := c.Write(ctx, websocket.MessageBinary, []byte(s)); err != nil {
		t.Fatal(err)
	}
}

func needLinux(t *testing.T) {
	t.Helper()
	if runtime.GOOS != "linux" {
		t.Skip("session tests need a Unix shell")
	}
}

func TestOriginAndHostAllowlists(t *testing.T) {
	b := newBridge(t, Options{Version: "t", Origins: []string{"http://app-test:8000/"}, Hosts: []string{"Term-Test:7681"}})
	port := strings.Split(b.host, ":")[1]
	cases := []struct {
		name, host, origin string
		want               int
	}{
		{"allowed", "", testOrigin, 200},
		{"allowed 127", "", "http://127.0.0.1:5173", 200},
		{"config origin, trailing slash normalised", "", "http://app-test:8000", 200},
		{"missing origin", "", "", 403},
		{"wrong origin", "", "http://evil.example", 403},
		{"origin with other port", "", "http://localhost:9999", 403},
		{"rebinding host", "evil.example:" + port, testOrigin, 403},
		{"rebinding host, same name other port", "localhost:1", testOrigin, 403},
		{"localhost host", "localhost:" + port, testOrigin, 200},
		{"config host", "term-test:7681", testOrigin, 200},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			res := b.get(t, "/health", c.host, c.origin)
			if res.StatusCode != c.want {
				t.Fatalf("status %d, want %d", res.StatusCode, c.want)
			}
			acao := res.Header.Get("Access-Control-Allow-Origin")
			if c.want == 200 && acao == "" {
				t.Fatal("allowed request has no CORS header")
			}
			if c.want != 200 && acao != "" {
				t.Fatalf("refused request leaks CORS header %q", acao)
			}
		})
	}
}

func TestPreflight(t *testing.T) {
	b := newBridge(t, Options{})
	req, _ := http.NewRequest("OPTIONS", b.srv.URL+"/profiles", nil)
	req.Header.Set("Origin", testOrigin)
	req.Header.Set("Access-Control-Request-Private-Network", "true")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != 204 || res.Header.Get("Access-Control-Allow-Origin") != testOrigin || res.Header.Get("Access-Control-Allow-Private-Network") != "true" {
		t.Fatalf("bad preflight: %d %v", res.StatusCode, res.Header)
	}
	req.Header.Set("Origin", "http://evil.example")
	res2, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res2.Body.Close()
	if res2.StatusCode != 403 {
		t.Fatalf("evil preflight got %d", res2.StatusCode)
	}
}

func TestHealthAndProfiles(t *testing.T) {
	b := newBridge(t, Options{Version: "9.9.9"})
	var health struct {
		OK       bool   `json:"ok"`
		Version  string `json:"version"`
		Platform string `json:"platform"`
	}
	if err := json.NewDecoder(b.get(t, "/health", "", testOrigin).Body).Decode(&health); err != nil {
		t.Fatal(err)
	}
	if !health.OK || health.Version != "9.9.9" || health.Platform != runtime.GOOS {
		t.Fatalf("health = %+v", health)
	}
	var profiles struct {
		Default  string `json:"default"`
		Profiles []struct{ ID, Name string }
	}
	if err := json.NewDecoder(b.get(t, "/profiles", "", testOrigin).Body).Decode(&profiles); err != nil {
		t.Fatal(err)
	}
	if len(profiles.Profiles) == 0 || profiles.Default != profiles.Profiles[0].ID {
		t.Fatalf("profiles = %+v", profiles)
	}
	if res := b.get(t, "/nope", "", testOrigin); res.StatusCode != 404 {
		t.Fatalf("unknown path got %d", res.StatusCode)
	}
}

func TestSessionRejectsUnknownProfileAndBadOrigin(t *testing.T) {
	b := newBridge(t, Options{})
	if _, res, err := b.dial(t, "profile=../../bin/sh"); err == nil || res.StatusCode != 404 {
		t.Fatalf("unknown profile: err=%v", err)
	}
	// A profile's command is never read from the request.
	if _, res, err := b.dial(t, "profile=shell&command=/bin/true"); err != nil && res == nil {
		t.Fatalf("extra params should be ignored: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, res, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(b.srv.URL, "http")+"/session", &websocket.DialOptions{
		HTTPHeader: http.Header{"Origin": {"http://evil.example"}},
	})
	if err == nil || res.StatusCode != 403 {
		t.Fatalf("evil origin websocket: err=%v", err)
	}
}

func TestSessionRoundTrip(t *testing.T) {
	needLinux(t)
	b := newBridge(t, Options{})
	c, _, err := b.dial(t, "profile=shell&cols=100&rows=30")
	if err != nil {
		t.Fatal(err)
	}
	send(t, c, "echo chalk-$((40+2)) $TERM $COLORTERM\r")
	out, _ := readUntil(t, c, "chalk-42 xterm-256color truecolor")
	if !strings.Contains(out, "chalk-42") {
		t.Fatalf("output %q", out)
	}
}

func TestSessionResize(t *testing.T) {
	needLinux(t)
	b := newBridge(t, Options{})
	c, _, err := b.dial(t, "profile=shell&cols=100&rows=30")
	if err != nil {
		t.Fatal(err)
	}
	send(t, c, "stty size\r")
	readUntil(t, c, "30 100")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := c.Write(ctx, websocket.MessageText, []byte(`{"type":"resize","cols":120,"rows":40}`)); err != nil {
		t.Fatal(err)
	}
	send(t, c, "echo size-$(stty size | tr ' ' x)\r")
	readUntil(t, c, "size-40x120")
}

func TestSessionExitMessage(t *testing.T) {
	needLinux(t)
	b := newBridge(t, Options{})
	c, _, err := b.dial(t, "profile=shell")
	if err != nil {
		t.Fatal(err)
	}
	send(t, c, "echo bye; exit 3\r")
	out, ctl := readUntil(t, c, "")
	if ctl == nil {
		_, ctl = readUntil(t, c, "")
	}
	if ctl == nil || ctl.Type != "exit" || ctl.Code == nil || *ctl.Code != 3 {
		t.Fatalf("control = %+v, output %q", ctl, out)
	}
}

func TestSessionStartErrorMessage(t *testing.T) {
	needLinux(t)
	b := newBridge(t, Options{
		Profiles: []Profile{{ID: "broken", Name: "Broken", Command: "/nonexistent/chalk-nothing"}},
		Default:  "broken",
	})
	c, _, err := b.dial(t, "profile=broken")
	if err != nil {
		t.Fatal(err)
	}
	_, ctl := readUntil(t, c, "")
	if ctl == nil || ctl.Type != "error" || ctl.Message == "" {
		t.Fatalf("control = %+v", ctl)
	}
}

func TestSessionCap(t *testing.T) {
	needLinux(t)
	b := newBridge(t, Options{MaxSessions: 2})
	for i := 0; i < 2; i++ {
		if _, _, err := b.dial(t, "profile=shell"); err != nil {
			t.Fatal(err)
		}
	}
	_, res, err := b.dial(t, "profile=shell")
	if err == nil || res == nil || res.StatusCode != 503 {
		t.Fatalf("third session: err=%v", err)
	}
}

func TestProcessKilledWhenSocketCloses(t *testing.T) {
	needLinux(t)
	pidFile := t.TempDir() + "/pid"
	b := newBridge(t, Options{
		Profiles: []Profile{{ID: "sleeper", Name: "Sleeper", Command: "/bin/sh", Args: []string{"-c", "echo $$ > " + pidFile + "; sleep 300"}}},
		Default:  "sleeper",
	})
	c, _, err := b.dial(t, "profile=sleeper")
	if err != nil {
		t.Fatal(err)
	}
	var pid int
	for i := 0; i < 100 && pid == 0; i++ {
		if data, err := os.ReadFile(pidFile); err == nil {
			fmt.Sscan(string(data), &pid)
		}
		time.Sleep(50 * time.Millisecond)
	}
	if pid == 0 {
		t.Fatal("sleeper never started")
	}
	c.Close(websocket.StatusNormalClosure, "bye")
	for i := 0; i < 100; i++ {
		// Signal 0 succeeds while the process (or an unreaped zombie) exists;
		// the bridge reaps it, so ESRCH means it is gone.
		if err := syscall.Kill(pid, 0); err == syscall.ESRCH {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("process %d still alive after the socket closed", pid)
}
