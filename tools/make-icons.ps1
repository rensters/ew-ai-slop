# tools/make-icons.ps1
# shrinks the bee (tools\icon-source.png) down into the icon sizes the browsers want.
# run:  powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1
# swap icon-source.png for any square png and rerun if you ever get bored of the bee

Add-Type -AssemblyName System.Drawing
$src = Join-Path $PSScriptRoot 'icon-source.png'
$out = Join-Path $PSScriptRoot '..\src\icons'
New-Item -ItemType Directory -Force $out | Out-Null

$big = [System.Drawing.Image]::FromFile($src)
foreach ($size in 16, 32, 48, 128) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  # stops the bicubic from smearing the edge pixels into a gross dark border
  $wrap = New-Object System.Drawing.Imaging.ImageAttributes
  $wrap.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
  $g.DrawImage($big, (New-Object System.Drawing.Rectangle 0, 0, $size, $size), 0, 0, $big.Width, $big.Height, [System.Drawing.GraphicsUnit]::Pixel, $wrap)
  $g.Dispose()
  $path = Join-Path $out "icon$size.png"
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output "bee'd $path"
}
$big.Dispose()
