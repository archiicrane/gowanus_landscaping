$ErrorActionPreference = 'Stop'

$gdalBin = 'C:\Program Files\GDAL'
$gdalWarp = Join-Path $gdalBin 'gdalwarp.exe'
$gdalContour = Join-Path $gdalBin 'gdal_contour.exe'
$ogr2ogr = Join-Path $gdalBin 'ogr2ogr.exe'

if (!(Test-Path $gdalWarp) -or !(Test-Path $gdalContour) -or !(Test-Path $ogr2ogr)) {
  throw 'GDAL tools not found. Install GISInternals.GDAL and ensure C:\Program Files\GDAL exists.'
}

$env:PATH = "$gdalBin;$env:PATH"
$env:PROJ_LIB = Join-Path $gdalBin 'projlib'
$env:GDAL_DATA = Join-Path $gdalBin 'gdal-data'

$srcTif = '.\models\be_NYC_020.tif'
$srcCrDownload = '.\models\be_NYC_020.tif.crdownload'

if (!(Test-Path $srcTif)) {
  if (Test-Path $srcCrDownload) {
    throw 'Found only be_NYC_020.tif.crdownload. Finish the download and rename to be_NYC_020.tif before running this script.'
  }
  throw 'Missing models\be_NYC_020.tif.'
}

# Match the contour bounding box already used in main.js.
$west = -73.99889524234268
$south = 40.665495232798115
$east = -73.98084416376932
$north = 40.683945676183654

$clipDem = '.\models\be_NYC_020_gowanus_clip.tif'
$outGeoJson = '.\models\con_lines_gowanus_1ft.geojson'
$tmpGeoJson = '.\models\con_lines_gowanus_1ft_unclipped.geojson'

Write-Host 'Step 1/3: Clip and reproject DEM to EPSG:4326 bbox...'
& $gdalWarp -overwrite -t_srs EPSG:4326 -te_srs EPSG:4326 -te $west $south $east $north -r bilinear $srcTif $clipDem

Write-Host 'Step 2/3: Generate 1-foot contours...'
& $gdalContour -a ELEV -i 1 $clipDem $tmpGeoJson

Write-Host 'Step 3/3: Enforce strict bbox clip...'
& $ogr2ogr -overwrite -f GeoJSON -clipsrc $west $south $east $north $outGeoJson $tmpGeoJson

if (Test-Path $tmpGeoJson) {
  Remove-Item -Force $tmpGeoJson
}

Get-Item $clipDem, $outGeoJson | Select-Object Name,Length | Format-Table -AutoSize
Write-Host 'Done. main.js is already configured to prefer models/con_lines_gowanus_1ft.geojson.'
