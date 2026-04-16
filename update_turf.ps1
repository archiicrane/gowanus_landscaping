# PowerShell script to download the latest Turf.js v6.5.0 minified file
$uri = "https://unpkg.com/@turf/turf@6.5.0/turf.min.js"
$outFile = "vendor/turf.min.js"
Invoke-WebRequest -Uri $uri -OutFile $outFile
Write-Host "Downloaded Turf.js to $outFile"
