# Diagnostic script - performs the full sequence with minimal stdout noise.
$ErrorActionPreference = 'Continue'
$BackendDir = 'D:\Project\ProfileAI\profileai_backend'
$LogFile    = Join-Path $BackendDir '_resume_run.log'
$ResultFile = Join-Path $BackendDir '_diag_result.txt'
$TokenFile  = Join-Path $BackendDir '_diag_token.txt'

function Write-Log {
    param([string]$Msg)
    Add-Content -Path $ResultFile -Value $Msg -Encoding utf8
}

"=== Step 1: kill leftover node/tsx ===" | Out-File -FilePath $ResultFile -Encoding utf8
Get-Process node,tsx -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep 2
$remaining = @(Get-Process node,tsx -ErrorAction SilentlyContinue)
"Remaining node/tsx procs count: $($remaining.Count)" | Out-File -FilePath $ResultFile -Append -Encoding utf8
$remaining | ForEach-Object { "  pid=$($_.Id) name=$($_.ProcessName)" | Out-File -FilePath $ResultFile -Append -Encoding utf8 }

"=== Step 2: start backend async (hidden) ===" | Out-File -FilePath $ResultFile -Append -Encoding utf8
Remove-Item $LogFile -ErrorAction SilentlyContinue
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'cmd.exe'
$psi.WorkingDirectory = $BackendDir
$psi.Arguments = '/c npm run dev > _resume_run.log 2>&1'
$psi.UseShellExecute = $true
$psi.WindowStyle = 'Hidden'
[void][System.Diagnostics.Process]::Start($psi)

"=== Step 3: wait for port 5000 ===" | Out-File -FilePath $ResultFile -Append -Encoding utf8
$portReady = $false
for ($i=0; $i -lt 90; $i++) {
    $c = Get-NetTCPConnection -State Listen -LocalPort 5000 -ErrorAction SilentlyContinue
    if ($c) {
        $portReady = $true
        "Port 5000 listening after $i s, pid=$($c[0].OwningProcess)" | Out-File -FilePath $ResultFile -Append -Encoding utf8
        break
    }
    Start-Sleep 1
}
if (-not $portReady) {
    "Port 5000 NOT listening after 90s." | Out-File -FilePath $ResultFile -Append -Encoding utf8
    if (Test-Path $LogFile) {
        "--- Tail of _resume_run.log ---" | Out-File -FilePath $ResultFile -Append -Encoding utf8
        Get-Content $LogFile -Tail 200 | Out-File -FilePath $ResultFile -Append -Encoding utf8
    }
    exit 1
}

"=== Step 4: login as tester@example.com ===" | Out-File -FilePath $ResultFile -Append -Encoding utf8
$email = 'tester@example.com'
$password = 'Test12345!'
$token = $null

function Try-Login {
    param([string]$e, [string]$p)
    $body = @{ email = $e; password = $p } | ConvertTo-Json -Compress
    try {
        $resp = Invoke-RestMethod -Uri 'http://127.0.0.1:5000/api/v1/auth/login' -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 20
        return [pscustomobject]@{ ok = $true; token = $resp.data.accessToken; body = $resp }
    } catch {
        $resp = $_.Exception.Response
        $errBody = $null
        if ($resp) {
            $stream = $resp.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $errBody = $reader.ReadToEnd()
        }
        return [pscustomobject]@{ ok = $false; err = $_.Exception.Message; body = $errBody }
    }
}

$result = Try-Login -e $email -p $password
if ($result.ok) {
    $token = $result.token
    "Login OK for $email. token len=$($token.Length) prefix=$($token.Substring(0,[Math]::Min(30,$token.Length)))" | Out-File -FilePath $ResultFile -Append -Encoding utf8
} else {
    "Login failed for $email : $($result.err). Body=$($result.body)" | Out-File -FilePath $ResultFile -Append -Encoding utf8
    # Try registering
    "Attempting /auth/register ..." | Out-File -FilePath $ResultFile -Append -Encoding utf8
    $regBody = @{ email = $email; password = $password; name = 'Tester' } | ConvertTo-Json -Compress
    try {
        $regResp = Invoke-RestMethod -Uri 'http://127.0.0.1:5000/api/v1/auth/register' -Method Post -ContentType 'application/json' -Body $regBody -TimeoutSec 20
        "Register response: $($regResp | ConvertTo-Json -Depth 4)" | Out-File -FilePath $ResultFile -Append -Encoding utf8
    } catch {
        "Register failed: $($_.Exception.Message)" | Out-File -FilePath $ResultFile -Append -Encoding utf8
        if ($_.Exception.Response) {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            "Register body: $($reader.ReadToEnd())" | Out-File -FilePath $ResultFile -Append -Encoding utf8
        }
    }
    $result2 = Try-Login -e $email -p $password
    if ($result2.ok) {
        $token = $result2.token
        "Login OK after register." | Out-File -FilePath $ResultFile -Append -Encoding utf8
    } else {
        "Login still failed: $($result2.err)" | Out-File -FilePath $ResultFile -Append -Encoding utf8
    }
}

if ($token) {
    Set-Content -Path $TokenFile -Value $token -Encoding utf8
}

"=== Step 5: pick a templateId ===" | Out-File -FilePath $ResultFile -Append -Encoding utf8
$templateId = $null
$templateName = $null
if ($token) {
    $headers = @{ Authorization = "Bearer $token" }
    foreach ($tplUrl in @('http://127.0.0.1:5000/api/v1/templates','http://127.0.0.1:5000/api/v1/resumes/templates','http://127.0.0.1:5000/api/v1/resume/templates')) {
        try {
            $tplResp = Invoke-RestMethod -Uri $tplUrl -Method Get -Headers $headers -TimeoutSec 15
            "GET $tplUrl -> OK. Listing first 3 entries." | Out-File -FilePath $ResultFile -Append -Encoding utf8
            ($tplResp.data | Select-Object -First 3 | ForEach-Object { "  id=$($_.id) name=$($_.name) isActive=$($_.isActive)" }) | Out-File -FilePath $ResultFile -Append -Encoding utf8
            $first = $tplResp.data | Where-Object { $_.isActive -ne $false } | Select-Object -First 1
            if (-not $first) { $first = $tplResp.data | Select-Object -First 1 }
            if ($first) {
                $templateId = $first.id
                $templateName = $first.name
                "Picked templateId=$templateId name=$templateName" | Out-File -FilePath $ResultFile -Append -Encoding utf8
                break
            }
        } catch {
            "GET $tplUrl -> $($_.Exception.Message)" | Out-File -FilePath $ResultFile -Append -Encoding utf8
        }
    }
}

"=== Step 6: POST /api/v1/resumes/generate ===" | Out-File -FilePath $ResultFile -Append -Encoding utf8
if ($token -and $templateId) {
    $genBody = @{
        templateId      = $templateId
        title           = 'Diagnostic Resume'
        type            = 'RESUME'
        targetJobTitle  = 'Software Engineer'
        jobDescription  = 'We are looking for a software engineer with experience in Node.js, TypeScript, React, and PostgreSQL. The role involves building scalable web applications, collaborating with cross-functional teams, and contributing to architecture decisions.'
    } | ConvertTo-Json -Compress
    $callSnippet = "Invoke-RestMethod -Uri 'http://127.0.0.1:5000/api/v1/resumes/generate' -Method Post -Headers @{ Authorization = 'Bearer (token)' } -ContentType 'application/json' -Body $genBody"
    "Call summary: $callSnippet" | Out-File -FilePath $ResultFile -Append -Encoding utf8
    try {
        $genResp = Invoke-RestMethod -Uri 'http://127.0.0.1:5000/api/v1/resumes/generate' -Method Post -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json' -Body $genBody -TimeoutSec 180
        "--- Full response (success path) ---" | Out-File -FilePath $ResultFile -Append -Encoding utf8
        $genResp | ConvertTo-Json -Depth 20 | Out-File -FilePath $ResultFile -Append -Encoding utf8
    } catch {
        "--- Error path ---" | Out-File -FilePath $ResultFile -Append -Encoding utf8
        $resp = $_.Exception.Response
        if ($resp) {
            "Status: $($resp.StatusCode)" | Out-File -FilePath $ResultFile -Append -Encoding utf8
            $stream = $resp.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $body = $reader.ReadToEnd()
            "Body: $body" | Out-File -FilePath $ResultFile -Append -Encoding utf8
        } else {
            "Exception: $($_.Exception.Message)" | Out-File -FilePath $ResultFile -Append -Encoding utf8
        }
    }
} else {
    "Skipping generate: token=$($null -ne $token) templateId='$templateId'" | Out-File -FilePath $ResultFile -Append -Encoding utf8
}

"=== Step 7: filtered backend log ===" | Out-File -FilePath $ResultFile -Append -Encoding utf8
if (Test-Path $LogFile) {
    "--- Filtered lines ([AI], Trying model, attempts failed, Error:, resume.service) ---" | Out-File -FilePath $ResultFile -Append -Encoding utf8
    $pattern = '(\[AI\]|Trying model|attempts failed|Error:|resume\.service)'
    $matches = Select-String -Path $LogFile -Pattern $pattern
    if ($matches) {
        foreach ($m in $matches) { "L$($m.LineNumber): $($m.Line)" | Out-File -FilePath $ResultFile -Append -Encoding utf8 }
    } else {
        "(no matches)" | Out-File -FilePath $ResultFile -Append -Encoding utf8
    }
    "--- Last 200 lines of _resume_run.log ---" | Out-File -FilePath $ResultFile -Append -Encoding utf8
    Get-Content $LogFile -Tail 200 | Out-File -FilePath $ResultFile -Append -Encoding utf8
} else {
    "Log file missing: $LogFile" | Out-File -FilePath $ResultFile -Append -Encoding utf8
}

"=== DONE ===" | Out-File -FilePath $ResultFile -Append -Encoding utf8