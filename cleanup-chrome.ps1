# Dọn Chrome headless mồ côi của renderer (match theo cờ đặc trưng, không đụng trình duyệt người dùng)
Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object {
  $_.CommandLine -match '--headless' -and $_.CommandLine -match 'no-sandbox'
} | ForEach-Object {
  Write-Output ("kill " + $_.ProcessId)
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}
Write-Output "done"
