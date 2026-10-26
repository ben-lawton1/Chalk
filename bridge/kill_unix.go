//go:build !windows

package main

import (
	"syscall"

	pty "github.com/aymanbagabas/go-pty"
)

// prepareCmd needs nothing on Unix: go-pty already starts a new session.
func prepareCmd(c *pty.Cmd) {}

// killTree kills the whole process group (the child is a session leader).
func killTree(c *pty.Cmd) {
	if c.Process == nil {
		return
	}
	_ = syscall.Kill(-c.Process.Pid, syscall.SIGKILL)
	_ = c.Process.Kill()
}
