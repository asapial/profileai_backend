# Uses the ALREADY-RUNNING backend on port 5000.
# Just login, fetch templates, POST /resumes/generate, then dump everything.
$ErrorActionPreference = 'Continue'
$BackendDir = 'D:\Project\ProfileAI\profileai_backend'
$ResultFile = Join-Path $BackendDir '_diag_result.txt'
$TokenFile  = Join-Path $BackendDir '_diag_token.txt'

# Start fresh result file
"" | Out-File -FilePath $ResultFile -Encoding utf8

"=== Backend status check ===" | Out-File -FilePath $ResultFile -Append -Encoding utf8
$conn = Get-NetTCPConnection -State Listen -LocalPort 5000 -ErrorAction SilentlyContinue
if ($conn) {
    "Port 5000 listening, pid=$($conn[0].OwningProcess)" | Out-File -FilePath $ResultFile -Append -Encoding utf8
} else {
    "Port 5000 NOT listening - abort" | Out-File -FilePath $ResultFile -Append -Encoding utf8
    exit 1
}

$email = 'tester@example.com'
$password = 'Test12345!'

"=== Login as $email ===" | Out-File -FilePath $ResultFile -Append -Encoding utf8
$body = @{ email = $email; password = $password } | ConvertTo-Json -Compress
$token = $null
try {
    $resp = Invoke-RestMethod -Uri 'http://127.0.0.1:5000/api/v1/auth/login' -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 20
    $token = $resp.data.accessToken
    "Login OK. Token length=$($token.Length)" | Out-File -FilePath $ResultFile -Append -Encoding utf8
    Set-Content -Path $TokenFile -Value $token -Encoding utf8
} catch {
    $errBody = $null
    if ($_.Exception.Response) {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $errBody = $reader.ReadToEnd()
    }
    "Login failed: $($_.Exception.Message)" | Out-File -FilePath $ResultFile -Append -Encoding utf8
    "Body: $errBody" | Out-File -FilePath $ResultFile -Append -Encoding utf8
}

if (-not $token) {
    "=== Trying /auth/register ===" | Out-File -FilePath $ResultFile -Append -Encoding utf8
    $regBody = @{ email = $email; password = $password; name = 'Tester' } | ConvertTo-Json -Compress
    try {
        $r = Invoke-RestMethod -Uri 'http://127.0.0.1:5000/api/v1/auth/register' -Method Post -ContentType 'application/json' -Body $regBody -TimeoutSec 20
        "Register OK: $($r | ConvertTo-Json -Depth 4)" | Out-File -FilePath $ResultFile -Append -Encoding utf8
    } catch {
        $errBody = $null
        if ($_.Exception.Response) {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $errBody = $reader.ReadToEnd()
        }
        "Register error: $($_.Exception.Message); Body: $errBody" | Out-File -FilePath $ResultFile -Append -Encoding utf8
    }
    try {
        $resp = Invoke-RestMethod -Uri 'http://127.0.0.1:5000/api/v1/auth/login' -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 20
        $token = $resp.data.accessToken
        "Login OK after register." | Out-File -FilePath $ResultFile -Append -Encoding utf8
        Set-Content -Path $TokenFile -Value $token -Encoding utf8
    } catch {
        "Login still failed: $($_.Exception.Message)" | Out-File -FilePath $ResultFile -Append -Encoding utf8
    }
}

"=== Fetch templates ===" | Out-File -FilePath $ResultFile -Append -Encoding utf8
$templateId = $null
$templateName = $null
if ($token) {
    $headers = @{ Authorization = "Bearer $token" }
    foreach ($tplUrl in @('http://127.0.0.1:5000/api/v1/templates','http://127.0.0.1:5000/api/v1/resumes/templates','http://127.0.0.1:5000/api/v1/resume/templates')) {
        try {
            $tplResp = Invoke-RestMethod -Uri $tplUrl -Method Get -Headers $headers -TimeoutSec 15
            "GET $tplUrl -> OK" | Out-File -FilePath $ResultFile -Append -Encoding utf8
            $tplResp | ConvertTo-Json -Depth 6 | Out-File -FilePath $ResultFile -Append -Encoding utf8
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
            if ($_.Exception.Response) {
                $stream = $_.Exception.Response.GetResponseStream()
                $reader = New-Object System.IO.StreamReader($stream)
                "Body: $($reader.ReadToEnd())" | Out-File -FilePath $ResultFile -Append -Encoding utf8
            }
        }
    }
}

"=== POST /api/v1/resumes/generate ===" | Out-File -FilePath $ResultFile -Append -Encoding utf8
if ($token -and $templateId) {
    $genBody = @{
        templateId      = $templateId
        title           = 'Diagnostic Resume'
        type            = 'RESUME'
        targetJobTitle  = 'Software Engineer'
        jobDescription  = 'We are looking for a software engineer with experience in Node.js, TypeScript, React, and PostgreSQL. The role involves building scalable web applications, collaborating with cross-functional teams, and contributing to architecture decisions.'
    } | ConvertTo-Json -Compress
    "Body: $genBody" | Out-File -FilePath $ResultFile -Append -Encoding utf8
    try {
        $genResp = Invoke-RestMethod -Uri 'http://127.0.0.1:5000/api/v1/resumes/generate' -Method Post -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json' -Body $genBody -TimeoutSec 240
        "--- SUCCESS response ---" | Out-File -FilePath $ResultFile -Append -Encoding utf8
        $genResp | ConvertTo-Json -Depth 20 | Out-File -FilePath $ResultFile -Append -Encoding utf8
    } catch {
        "--- ERROR response ---" | Out-File -FilePath $ResultFile -Append -Encoding utf8
        if ($_.Exception.Response) {
            "Status: $($_.Exception.Response.StatusCode)" | Out-File -FilePath $ResultFile -Append -Encoding utf8
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            "Body: $($reader.ReadToEnd())" | Out-File -FilePath $ResultFile -Append -Encoding utf8
        } else {
            "Exception: $($_.Exception.Message)" | Out-File -FilePath $ResultFile -Append -Encoding utf8
        }
    }
} else {
    "Skipping: token=$($null -ne $token) templateId='$templateId'" | Out-File -FilePath $ResultFile -Append -Encoding utf8
}

"=== Filtered log tail ===" | Out-File -FilePath $ResultFile -Append -Encoding utf8
$LogFile = Join-Path $BackendDir '_resume_run.log'
if (Test-Path $LogFile) {
    "--- Filtered (AI / Trying model / attempts failed / Error / resume.service) ---" | Out-File -FilePath $ResultFile -Append -Encoding utf8
    $matches = Select-String -Path $LogFile -Pattern '(\[AI\]|Trying model|attempts failed|Error:|resume\.service)'
    if ($matches) {
        foreach ($m in $matches) { "L$($m.LineNumber): $($m.Line)" | Out-File -FilePath $ResultFile -Append -Encoding utf8 }
    } else {
        "(no matches)" | Out-File -FilePath $ResultFile -Append -Encoding utf8
    }
    "--- Last 200 lines ---" | Out-File -FilePath $ResultFile -Append -Encoding utf8
    Get-Content $LogFile -Tail 200 | Out-File -FilePath $ResultFile -Append -Encoding utf8
}

"=== DONE ===" | Out-File -FilePath $ResultFile -Append -Encoding utf8