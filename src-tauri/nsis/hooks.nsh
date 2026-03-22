; NSIS installer hooks for Motrix Next.
; These macros are invoked by Tauri's NSIS template during both
; fresh installs AND silent OTA (updater) installs.

!macro NSIS_HOOK_PREINSTALL
  ; Defense-in-depth: kill any lingering sidecar before file copy.
  ; Tauri bundles externalBin as motrixnext-aria2c.exe (renamed from aria2c).
  ; aria2 is single-process — no child processes to worry about.
  ; On Windows, a running .exe is locked by the OS and cannot be overwritten.
  ; taskkill exits with code 128 if the process does not exist — harmless.
  nsExec::ExecToLog 'taskkill /F /IM motrixnext-aria2c.exe'
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Flush Windows icon cache so updated icons appear immediately.
  ; ie4uinit.exe is a built-in Windows 10/11 system utility that
  ; soft-refreshes the shell icon display without requiring a reboot.
  ; This is the industry-standard approach used by Electron, VS Code,
  ; and other major desktop applications.
  nsExec::ExecToLog 'ie4uinit.exe -show'
!macroend
