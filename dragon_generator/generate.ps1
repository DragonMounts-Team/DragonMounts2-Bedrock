param(
  [string]$Type,
  [ValidateSet('all')]
  [string]$Assets,
  [switch]$All,
  [switch]$DryRun,
  [switch]$Validate,
  [switch]$Summary,
  [switch]$Diff,
  [string]$Config
)

$arguments = @()
if ($Type) { $arguments += @('--type', $Type) }
if ($Assets) { $arguments += @('--assets', $Assets) }
if ($All) { $arguments += '--all' }
if ($DryRun) { $arguments += '--dry-run' }
if ($Validate) { $arguments += '--validate' }
if ($Summary) { $arguments += '--summary' }
if ($Diff) { $arguments += '--diff' }
if ($Config) { $arguments += @('--config', $Config) }

node (Join-Path $PSScriptRoot 'generate.js') @arguments
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
