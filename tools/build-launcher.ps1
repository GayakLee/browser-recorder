$ErrorActionPreference = 'Stop'
$movieRoot = Split-Path -Parent $PSScriptRoot
$movieCompiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$movieName = (Get-Content -Raw -LiteralPath (Join-Path $movieRoot 'package.json') | ConvertFrom-Json).name
$movieArguments = @('/nologo', '/optimize+', '/debug-', '/target:exe', ('/out:' + (Join-Path $movieRoot ($movieName + '.exe'))))
& $movieCompiler @movieArguments (Join-Path $PSScriptRoot 'Launcher.cs')
if ($LASTEXITCODE -ne 0) { throw 'Launcher compilation failed' }
