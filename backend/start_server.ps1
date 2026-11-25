param(
    [string]$BindHost = "127.0.0.1",
    [int]$Port = 8000,
    [switch]$Mock
)

Set-Location $PSScriptRoot
if ($Mock) {
    $env:PORTAL_MOCK = "1"
}

Write-Host "Starting Lung Radiology FM Portal FastAPI server on http://${BindHost}:${Port} (PORTAL_MOCK=$($env:PORTAL_MOCK))"
uvicorn server:app --host $BindHost --port $Port
