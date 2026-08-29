# =====================================================================
#  Live Translator - PowerShell fallback server (no installation needed)
#  Used when Node.js is not installed. Serves http://localhost:8765
# =====================================================================

$ErrorActionPreference = 'Continue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

$port        = 8765
$root        = Split-Path -Parent $MyInvocation.MyCommand.Definition
$transcripts = Join-Path $root 'transcripts'
if (-not (Test-Path $transcripts)) { New-Item -ItemType Directory -Path $transcripts | Out-Null }

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
try {
    $listener.Start()
} catch {
    Write-Host ""
    Write-Host "  Could not open port $port." -ForegroundColor Red
    Write-Host "  The server may already be running - just open: http://localhost:$port"
    Write-Host ""
    Read-Host "Press Enter to close"
    exit 1
}

Write-Host ""
Write-Host "  =========================================="
Write-Host "   Live Translator  ES -> HE   |   RUNNING" -ForegroundColor Green
Write-Host "  =========================================="
Write-Host ""
Write-Host "   URL:         http://localhost:$port"
Write-Host "   Transcripts: $transcripts"
Write-Host ""
Write-Host "   Keep this window open while you use the app."
Write-Host "   To stop: close this window."
Write-Host ""

$utf8    = New-Object System.Text.UTF8Encoding($false)
$utf8bom = New-Object System.Text.UTF8Encoding($true)
$cache   = @{}

function Send-Response($ctx, $status, $bytes, $type) {
    try {
        $ctx.Response.StatusCode    = $status
        $ctx.Response.ContentType   = $type
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {}
    try { $ctx.Response.OutputStream.Close() } catch {}
}
function Send-Text($ctx, $status, $text, $type) {
    Send-Response $ctx $status $utf8.GetBytes($text) $type
}

$JSON = 'application/json; charset=utf-8'

function Get-Translation($q, $sl, $tl) {
    $key = "$sl>$tl>$q"
    if ($cache.ContainsKey($key)) { return $cache[$key] }

    $tlg = if ($tl -eq 'he') { 'iw' } else { $tl }
    $enc = [uri]::EscapeDataString($q)
    $out = $null

    # 1 - fastest endpoint
    try {
        $u = "https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=$sl&tl=$tlg&q=$enc"
        $j = (Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 7).Content | ConvertFrom-Json
        if ($j -is [array]) { $out = ($j -join ' ') }
    } catch {}

    # 2 - classic endpoint
    if (-not $out) {
        try {
            $u = "https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=$sl&tl=$tlg&q=$enc"
            $j = (Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 7).Content | ConvertFrom-Json
            $sb = New-Object System.Text.StringBuilder
            foreach ($seg in $j[0]) { if ($seg[0]) { [void]$sb.Append($seg[0]) } }
            if ($sb.Length -gt 0) { $out = $sb.ToString() }
        } catch {}
    }

    # 3 - MyMemory
    if (-not $out) {
        try {
            $tlm = if ($tlg -eq 'iw') { 'he' } else { $tlg }
            $u = "https://api.mymemory.translated.net/get?langpair=$sl|$tlm&q=$enc"
            $j = (Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 7).Content | ConvertFrom-Json
            if ($j.responseData.translatedText) { $out = $j.responseData.translatedText }
        } catch {}
    }

    if ($out) {
        if ($cache.Count -gt 3000) { $cache.Clear() }
        $cache[$key] = $out
    }
    return $out
}

$mime = @{ '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8';
           '.css'  = 'text/css; charset=utf-8';  '.json' = $JSON; '.txt' = 'text/plain; charset=utf-8' }

# warm up the TLS connection so the first translation is not slow
try { Get-Translation 'hola' 'es' 'he' | Out-Null } catch {}

while ($listener.IsListening) {
    try { $ctx = $listener.GetContext() } catch { break }
    $req  = $ctx.Request
    $path = $req.Url.AbsolutePath

    try {
        if ($path -eq '/api/health') {
            Send-Text $ctx 200 ('{"ok":true,"port":' + $port + ',"node":"PowerShell"}') $JSON
        }
        elseif ($path -eq '/api/translate') {
            $q  = $req.QueryString['q']
            $sl = $req.QueryString['sl']; if (-not $sl) { $sl = 'es' }
            $tl = $req.QueryString['tl']; if (-not $tl) { $tl = 'he' }
            if ([string]::IsNullOrWhiteSpace($q)) {
                Send-Text $ctx 200 '{"text":"","provider":"none"}' $JSON
            } else {
                $t = Get-Translation $q $sl $tl
                if ($t) {
                    Send-Text $ctx 200 (@{ text = $t; provider = 'powershell' } | ConvertTo-Json -Compress) $JSON
                } else {
                    Send-Text $ctx 502 '{"error":"translation failed"}' $JSON
                }
            }
        }
        elseif ($path -eq '/api/save' -and $req.HttpMethod -eq 'POST') {
            $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
            $body   = $reader.ReadToEnd(); $reader.Close()
            $data   = $body | ConvertFrom-Json
            $name   = ($data.session -replace '[\\/:*?"<>|]', '_')
            if (-not $name) { $name = 'session' }
            if ($data.txt)  { [IO.File]::WriteAllText((Join-Path $transcripts ($name + '.txt')),  $data.txt,  $utf8bom) }
            if ($data.html) { [IO.File]::WriteAllText((Join-Path $transcripts ($name + '.html')), $data.html, $utf8) }
            Send-Text $ctx 200 '{"ok":true}' $JSON
        }
        else {
            $rel  = if ($path -eq '/') { 'index.html' } else { $path.TrimStart('/') }
            $rel  = [uri]::UnescapeDataString($rel) -replace '\.\.', ''
            $full = Join-Path $root $rel
            if (Test-Path $full -PathType Leaf) {
                $ext  = [IO.Path]::GetExtension($full).ToLower()
                $type = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
                Send-Response $ctx 200 ([IO.File]::ReadAllBytes($full)) $type
            } else {
                Send-Text $ctx 404 '{"error":"not found"}' $JSON
            }
        }
    } catch {
        try { Send-Text $ctx 500 '{"error":"server error"}' $JSON } catch {}
    }
}

$listener.Stop()
