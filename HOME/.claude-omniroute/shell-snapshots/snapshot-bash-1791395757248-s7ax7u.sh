# Snapshot file
# Unset all aliases to avoid conflicts with functions
unalias -a 2>/dev/null || true
shopt -s expand_aliases
# Check for rg availability
if ! hash rg 2>/dev/null && ! typeset -f rg >/dev/null 2>&1; then
  function rg {
  local _cc_bin="${CLAUDE_CODE_EXECPATH:-}"
  [[ -x $_cc_bin ]] || _cc_bin=/c/Users/Khaled.Mahmoud/.local/bin/claude.exe
  if [[ ! -x $_cc_bin ]]; then command rg ${1+"$@"}; return; fi
  if [[ -n ${ZSH_VERSION:-} ]]; then
    ARGV0=rg "$_cc_bin" ${1+"$@"}
  elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "win32" ]]; then
    ARGV0=rg "$_cc_bin" ${1+"$@"}
  else
    (exec -a rg "$_cc_bin" ${1+"$@"})
  fi
}
fi
# Shadow pkill to refuse patterns matching the CLI process
unalias pkill 2>/dev/null || true
function pkill {
  if [ -n "${CLAUDE_PID:-}" ] && [ -r "/proc/${CLAUDE_PID}/comm" ]; then
    local _cc_skip="" _cc_a
    local -a _cc_probe=()
    for _cc_a in ${1+"$@"}; do
      if [ -n "$_cc_skip" ]; then _cc_skip=""; continue; fi
      case "$_cc_a" in
        --signal) _cc_skip=1 ;;
        --signal=*|-e|--echo) ;;
        -[0-9]*) ;;
        -[PUGOF]?*) _cc_probe+=("$_cc_a") ;;
        -[ABCDEFGHIJKLMNOPQRSTUVWXYZ][ABCDEFGHIJKLMNOPQRSTUVWXYZ0-9]*) ;;
        *) _cc_probe+=("$_cc_a") ;;
      esac
    done
    if command pgrep ${_cc_probe[@]+"${_cc_probe[@]}"} 2>/dev/null | command grep -qx "${CLAUDE_PID}"; then
      printf 'pkill: refusing to run — this pattern matches the Claude CLI process (PID %s). Narrow the pattern, or target your own children with `pkill -P $$ ...`.\n' "${CLAUDE_PID}" >&2
      return 1
    fi
  fi
  command pkill ${1+"$@"}
}
export PATH='/c/Users/Khaled.Mahmoud/bin:/ucrt64/bin:/usr/local/bin:/usr/bin:/bin:/ucrt64/bin:/usr/bin:/c/Users/Khaled.Mahmoud/bin:/c/Users/Khaled.Mahmoud/AppData/Roaming/Code/User/globalStorage/github.copilot-chat/debugCommand:/c/Users/Khaled.Mahmoud/AppData/Roaming/Code/User/globalStorage/github.copilot-chat/copilotCli:/c/Program Files/Microsoft/jdk-21.0.12.101-hotspot/bin:/c/Python314/Scripts:/c/Python314:/c/WINDOWS/system32:/c/WINDOWS:/c/WINDOWS/System32/Wbem:/c/WINDOWS/System32/WindowsPowerShell/v1.0:/c/WINDOWS/System32/OpenSSH:/c/ProgramData/chocolatey/bin:/c/Program Files/Microsoft SQL Server/Client SDK/ODBC/170/Tools/Binn:/c/Program Files (x86)/Microsoft SQL Server/150/Tools/Binn:/c/Program Files/Microsoft SQL Server/150/Tools/Binn:/c/Program Files/Microsoft SQL Server/150/DTS/Binn:/c/Program Files (x86)/Microsoft SQL Server/Client SDK/ODBC/130/Tools/Binn:/c/Program Files (x86)/Microsoft SQL Server/140/Tools/Binn:/c/Program Files (x86)/Microsoft SQL Server/140/DTS/Binn:/c/Program Files (x86)/Microsoft SQL Server/140/Tools/Binn/ManagementStudio:/c/Program Files/GitHub CLI:/cmd:/c/Program Files/nodejs:/c/Users/Khaled.Mahmoud/AppData/Local/hermes/bin:/c/Users/Khaled.Mahmoud/AppData/Local/Microsoft/WindowsApps:/c/Users/Khaled.Mahmoud/.local/bin:/c/Users/Khaled.Mahmoud/AppData/Local/Programs/Antigravity/bin:/c/Users/Khaled.Mahmoud/AppData/Local/Programs/Microsoft VS Code/bin:/c/Users/Khaled.Mahmoud/AppData/Local/Programs/Ollama:/c/Users/Khaled.Mahmoud/AppData/Roaming/npm:/c/Users/Khaled.Mahmoud/.vscode/extensions/ms-python.debugpy-2026.6.0-win32-x64/bundled/scripts/noConfigScripts:/usr/bin/vendor_perl:/usr/bin/core_perl'
