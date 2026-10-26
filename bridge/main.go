// chalk-terminal: the host terminal bridge for Chalk.
//
// It serves /health, /profiles and a /session WebSocket that wires a browser
// terminal (xterm.js) to a pseudo-terminal on this machine. See ../README.md,
// section "Terminal", for the security model.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"time"
)

// version is set at build time: -ldflags "-X main.version=...".
var version = "dev"

func main() {
	os.Exit(run(os.Args[1:]))
}

func run(args []string) int {
	fs := flag.NewFlagSet("chalk-terminal", flag.ContinueOnError)
	addr := fs.String("addr", "127.0.0.1:7681", "address to listen on")
	configPath := fs.String("config", "", "profiles file (default: ~/.chalk/terminal.json)")
	allowNonLoopback := fs.Bool("allow-non-loopback", false, "allow listening on a non-loopback address (only for private networks)")
	showVersion := fs.Bool("version", false, "print the version and exit")
	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return 0
		}
		return 2
	}
	if *showVersion {
		fmt.Println(version)
		return 0
	}

	if err := checkListenAddr(*addr, *allowNonLoopback); err != nil {
		log.Printf("refusing to start: %v", err)
		return 2
	}
	_, port, _ := net.SplitHostPort(*addr)

	path := *configPath
	if path == "" {
		path = defaultConfigPath()
	}
	cfg, err := loadConfig(path)
	if err != nil {
		log.Printf("config %s: %v", path, err)
		return 2
	}
	profiles, def, err := resolveProfiles(builtinProfiles(), cfg)
	if err != nil {
		log.Printf("config %s: %v", path, err)
		return 2
	}

	srv := NewServer(Options{
		Version:  version,
		Port:     port,
		Origins:  cfg.Origins,
		Hosts:    cfg.Hosts,
		Profiles: profiles,
		Default:  def,
	})

	ln, err := net.Listen("tcp", *addr)
	if err != nil {
		log.Printf("cannot listen on %s: %v (is another chalk-terminal running?)", *addr, err)
		return 1
	}
	log.Printf("chalk-terminal %s (%s/%s) listening on %s", version, runtime.GOOS, runtime.GOARCH, ln.Addr())
	log.Printf("config file: %s", path)
	log.Printf("profiles: %s (default %s)", profileIDs(profiles), def)

	httpSrv := &http.Server{Handler: srv, ReadHeaderTimeout: 10 * time.Second}
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt)
	go func() {
		<-stop
		log.Printf("shutting down")
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = httpSrv.Shutdown(ctx)
		_ = httpSrv.Close()
	}()
	if err := httpSrv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Printf("server error: %v", err)
		return 1
	}
	return 0
}

// checkListenAddr refuses anything but a loopback address unless allowed.
func checkListenAddr(addr string, allowNonLoopback bool) error {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return fmt.Errorf("bad --addr %q: %w", addr, err)
	}
	if port == "" {
		return fmt.Errorf("bad --addr %q: missing port", addr)
	}
	if allowNonLoopback || host == "localhost" {
		return nil
	}
	ip := net.ParseIP(host)
	if ip == nil || !ip.IsLoopback() {
		return fmt.Errorf("--addr %q is not a loopback address; pass --allow-non-loopback only on a private network", addr)
	}
	return nil
}
