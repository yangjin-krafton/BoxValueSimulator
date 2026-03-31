<#
.SYNOPSIS
    Reads text aloud using Windows SAPI (System.Speech).

.DESCRIPTION
    Uses the Windows built-in Text-to-Speech engine to read text or a file aloud.
    Supports rate adjustment, voice selection, and Korean/English text.

.PARAMETER Text
    The plain text to speak. Use this OR -InputFile.

.PARAMETER InputFile
    Path to a plain-text file to read aloud. Use this OR -Text.

.PARAMETER Rate
    Speech rate from -10 (slowest) to 10 (fastest). Default: 0 (normal).

.PARAMETER Voice
    Voice name (partial match). Leave empty for system default.
    Examples: "Microsoft Heami", "Microsoft David", "Zira"

.PARAMETER ListVoices
    Switch: print available installed voices and exit.

.EXAMPLE
    .\speak_windows.ps1 -InputFile "C:\docs\notes.txt"

.EXAMPLE
    .\speak_windows.ps1 -Text "안녕하세요" -Rate -2 -Voice "Heami"

.EXAMPLE
    .\speak_windows.ps1 -ListVoices
#>

param(
    [string]$Text = "",
    [string]$InputFile = "",
    [int]$Rate = 0,
    [string]$Voice = "",
    [switch]$ListVoices
)

Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer

# List available voices if requested
if ($ListVoices) {
    Write-Host "Available installed voices:"
    foreach ($v in $synth.GetInstalledVoices()) {
        $info = $v.VoiceInfo
        Write-Host "  Name: $($info.Name)  |  Culture: $($info.Culture)  |  Gender: $($info.Gender)"
    }
    $synth.Dispose()
    exit 0
}

# Select voice
if ($Voice -ne "") {
    $matched = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Name -like "*$Voice*" }
    if ($matched) {
        $synth.SelectVoice($matched[0].VoiceInfo.Name)
        Write-Host "Using voice: $($matched[0].VoiceInfo.Name)"
    } else {
        Write-Warning "Voice '$Voice' not found. Using system default."
    }
}

# Set rate
$synth.Rate = [Math]::Max(-10, [Math]::Min(10, $Rate))

# Get text to speak
$content = ""
if ($InputFile -ne "") {
    if (-not (Test-Path $InputFile)) {
        Write-Error "File not found: $InputFile"
        $synth.Dispose()
        exit 1
    }
    $content = Get-Content -Path $InputFile -Raw -Encoding UTF8
} elseif ($Text -ne "") {
    $content = $Text
} else {
    Write-Error "Provide either -Text or -InputFile."
    $synth.Dispose()
    exit 1
}

# Trim and speak
$content = $content.Trim()
if ($content.Length -eq 0) {
    Write-Warning "No text to speak."
    $synth.Dispose()
    exit 0
}

Write-Host "Speaking $($content.Length) characters at rate $($synth.Rate)..."
$synth.Speak($content)
$synth.Dispose()
Write-Host "Done."
