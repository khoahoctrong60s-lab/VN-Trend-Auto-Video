# pack.ps1 — đóng gói toàn bộ dự án thành video-template-engine.zip để đăng lên GitHub.
# Gồm: mã nguồn + engine + scripts + content + themes + assets + docs.
# Loại: node_modules, .venv-tts, output, log, file tạm.
# Cách dùng: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/pack.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$name = 'video-template-engine'
$stage = Join-Path $env:TEMP ('vte-pack-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
$pkgDir = Join-Path $stage $name
$zip = Join-Path $root ($name + '.zip')

New-Item -ItemType Directory -Force -Path $pkgDir | Out-Null

# Copy mã nguồn + tài liệu + asset
$items = @('package.json', 'package-lock.json', 'README.md', '.gitignore',
  'engine', 'scripts', 'content', 'themes', 'assets', 'docs')
foreach ($i in $items) {
  $src = Join-Path $root $i
  if (Test-Path $src) { Copy-Item -Recurse -Force $src (Join-Path $pkgDir $i) }
  else { Write-Host ('CANH BAO: khong tim thay ' + $i) }
}
# Tiện ích phụ ở gốc dự án
foreach ($u in @('cleanup-chrome.ps1')) {
  if (Test-Path (Join-Path $root $u)) { Copy-Item (Join-Path $root $u) $pkgDir }
}

# Loại bỏ những thứ không thuộc mã nguồn (phòng khi copy bằng wildcard)
foreach ($d in @('node_modules', '.venv-tts', 'output')) {
  $p = Join-Path $pkgDir $d
  if (Test-Path $p) { Remove-Item -Recurse -Force $p }
}
Get-ChildItem $pkgDir -Recurse -Include *.log, *.tmp, *.wav -ErrorAction SilentlyContinue |
  Remove-Item -Force -ErrorAction SilentlyContinue

# Đóng gói
if (Test-Path $zip) { Remove-Item -Force $zip }
Compress-Archive -Path $pkgDir -DestinationPath $zip

# Tự xác minh: số entry, dung lượng, không chứa thư mục nặng / file tạm
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipFile = [System.IO.Compression.ZipFile]::OpenRead($zip)
$count = $zipFile.Entries.Count
$totalBytes = ($zipFile.Entries | Measure-Object -Property Length -Sum).Sum
$bad = @()
foreach ($e in $zipFile.Entries) {
  if ($e.FullName -match 'node_modules|\.venv-tts|(^|/)output/|\.log$|\.wav$') { $bad += $e.FullName }
}
$zipFile.Dispose()
$zipMB = [math]::Round((Get-Item $zip).Length / 1MB, 2)

Write-Host ('ZIP: ' + $zip)
Write-Host ('Dung lượng: ' + $zipMB + ' MB | Entries: ' + $count + ' | Giải nén: ' +
  [math]::Round($totalBytes / 1MB, 1) + ' MB')
if ($bad.Count -gt 0) {
  Write-Host ('LOI: co entry khong mong muon: ' + ($bad -join ', '))
  exit 1
}
Write-Host 'OK: khong co node_modules / .venv-tts / output / log / wav trong zip'
Remove-Item -Recurse -Force $stage
