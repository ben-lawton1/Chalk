//go:build windows

package main

import (
	"os/exec"
	"strconv"
	"syscall"

	pty "github.com/aymanbagabas/go-pty"
)

func prepareCmd(c *pty.Cmd) {
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
}

// killTree kills the process and its children (closing the ConPTY alone can
// leave grandchildren such as ssh running).
func killTree(c *pty.Cmd) {
	if c.Process == nil {
		return
	}
	k := exec.Command("taskkill", "/T", "/F", "/PID", strconv.Itoa(c.Process.Pid))
	k.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	_ = k.Run()
	_ = c.Process.Kill()
}
