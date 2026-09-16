param(
  [string]$Type,
  [ValidateSet('all')]
  [string]$Assets,
  [switch]$All,
  [switch]$DryRun
)

$arguments = @()
if ($Type) { $arguments += @('--type', $Type) }
if ($Assets) { $arguments += @('--assets', $Assets) }
if ($All) { $arguments += '--all' }
if ($DryRun) { $arguments += '--dry-run' }

node (Join-Path $PSScriptRoot 'generate.js') @arguments
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
