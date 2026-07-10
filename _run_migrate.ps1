$ErrorActionPreference = 'Continue'
Set-Location 'D:\Project\ProfileAI\profileai_backend'
$logPath = 'D:\Project\ProfileAI\profileai_backend\_run_migrate.log'
"" | Out-File -FilePath $logPath -Encoding utf8
Add-Content -Path $logPath -Value "CWD: $(Get-Location)"
Add-Content -Path $logPath -Value "Node: $((& node --version) 2>&1)"
Add-Content -Path $logPath -Value "Starting prisma migrate dev..."
try {
  & npx prisma migrate dev --name add_unique_email --schema prisma/schema --create-only 2>&1 | ForEach-Object {
    Add-Content -Path $logPath -Value "OUT: $_"
  }
  Add-Content -Path $logPath -Value "EXITCODE: $LASTEXITCODE"
} catch {
  Add-Content -Path $logPath -Value "EXC: $_"
}
Add-Content -Path $logPath -Value "Migrations dir:"
Get-ChildItem 'prisma\migrations' -ErrorAction SilentlyContinue | Sort-Object Name | ForEach-Object {
  Add-Content -Path $logPath -Value "  $($_.Name)"
}
