param(
    [Parameter(Mandatory)]
    [ValidateSet('ready', 'thinking', 'tool', 'waiting', 'done', 'error', 'cancelled', 'ended')]
    [string]$Phase,
    [switch]$Launch
)

$ErrorActionPreference = 'Stop'

try {
    [Console]::InputEncoding = [System.Text.Encoding]::UTF8
    $event = [Console]::In.ReadToEnd() | ConvertFrom-Json
    $session = if ($event.sessionId) { [string]$event.sessionId } else { [string]$event.session_id }
    if (!$session -or $event.subagentType -or $event.subagent_type) { exit 0 }

    $state = $Phase
    if ($Phase -eq 'tool') {
        $tool = if ($event.toolName) { [string]$event.toolName } else { [string]$event.tool_name }
        $state = switch -Regex ($tool.ToLowerInvariant()) {
            '(^|_)(write|edit|patch|replace|delete|move)(_|$)' { 'editing'; break }
            '(^|_)(read|cat|find|list|grep|glob|search|view|fetch)(_|$)' { 'reading'; break }
            'shell|terminal|bash|run_command|exec' { 'running'; break }
            default { 'thinking' }
        }
    }

    $storage = Join-Path $env:LOCALAPPDATA 'GrokLivePet'
    $events = [System.IO.Directory]::CreateDirectory((Join-Path $storage 'events')).FullName
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $digest = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($session))
    } finally {
        $sha.Dispose()
    }
    $id = ([BitConverter]::ToString($digest)).Replace('-', '').Substring(0, 24).ToLowerInvariant()
    $target = Join-Path $events ($id + '.json')
    $stamp = [DateTimeOffset]::UtcNow
    $parsed = [DateTimeOffset]::MinValue
    if ([DateTimeOffset]::TryParse([string]$event.timestamp, [ref]$parsed)) { $stamp = $parsed }
    $when = $stamp.ToUnixTimeMilliseconds()
    $mutex = New-Object System.Threading.Mutex($false, ('Local\GrokLivePet-' + $id))
    $locked = $false
    try {
        try { $locked = $mutex.WaitOne(400) } catch [System.Threading.AbandonedMutexException] { $locked = $true }
        if ($locked) {
            $previous = $null
            if ([System.IO.File]::Exists($target)) {
                $previous = [System.IO.File]::ReadAllText($target) | ConvertFrom-Json -ErrorAction SilentlyContinue
            }
            if (!$previous -or $previous.at -le $when) {
                $tmp = Join-Path $events ([guid]::NewGuid().ToString('N') + '.tmp')
                try {
                    $json = @{ phase = $state; at = $when } | ConvertTo-Json -Compress
                    [System.IO.File]::WriteAllText($tmp, $json, (New-Object System.Text.UTF8Encoding($false)))
                    if ([System.IO.File]::Exists($target)) {
                        [System.IO.File]::Replace($tmp, $target, [NullString]::Value)
                    } else {
                        [System.IO.File]::Move($tmp, $target)
                    }
                } finally {
                    [System.IO.File]::Delete($tmp)
                }
            }
        }
    } finally {
        if ($locked) { $mutex.ReleaseMutex() }
        $mutex.Dispose()
    }

    if ($Launch -and !(Test-Path -LiteralPath (Join-Path $storage 'manual-start'))) {
        & (Join-Path $PSScriptRoot '../scripts/start.ps1') -Automatic
    }
} catch {
    # A desktop notification should never affect the Grok session.
}
exit 0
