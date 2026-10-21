param(
    [string]$BaseUrl = 'http://localhost:8000',
    [string]$OutputPath = (Join-Path $PSScriptRoot 'samples.json')
)

# Analysis-only: public localhost GETs; no account, media, or database writes.
$ErrorActionPreference = 'Stop'
$base = [Uri]$BaseUrl
if ($base.Scheme -notin @('http', 'https') -or $base.Host -notin @('localhost', '127.0.0.1', '[::1]') -or $base.UserInfo -or $base.Query -or $base.Fragment) {
    throw 'Only a local development HTTP(S) server is allowed.'
}
$root = $BaseUrl.TrimEnd('/')
$listing = Invoke-RestMethod -Uri "$root/api/v1/videos/public?page=1&page_size=50" -Method Get -TimeoutSec 30
$candidates = @($listing.items | Where-Object { $_.status -eq 'ready' } | Sort-Object duration, id)
if ($candidates.Count -lt 10) { throw 'Fewer than 10 ready candidates: record the gap instead of declaring sample coverage.' }
$chosen = [System.Collections.Generic.List[object]]::new()
$bob = $candidates | Where-Object { $_.id -eq '28091082-12e9-47dd-ab0c-8533e3bc27a8' } | Select-Object -First 1
if ($bob) { $chosen.Add($bob) }
for ($i = 0; $i -lt 10; $i++) {
    $item = $candidates[[int][Math]::Floor($i * ($candidates.Count - 1) / 9)]
    if ($item.id -notin @($chosen | ForEach-Object { $_.id })) { $chosen.Add($item) }
    if ($chosen.Count -eq 10) { break }
}
foreach ($item in $candidates) {
    if ($chosen.Count -eq 10) { break }
    if ($item.id -notin @($chosen | ForEach-Object { $_.id })) { $chosen.Add($item) }
}
$videos = @()
$ids = @($chosen | ForEach-Object { $_.id }) -join ','
$metadata = Invoke-RestMethod -Uri "$root/api/v1/discovery/learning-metadata?ids=$ids" -Method Get -TimeoutSec 30
foreach ($item in $chosen) {
    $detail = Invoke-RestMethod -Uri "$root/api/v1/videos/$($item.id)" -Method Get -TimeoutSec 30
    $subs = @($detail.subtitles)
    $visible = [bool]$detail.access.unlocked
    $meta = $metadata.($item.id)
    $anchors = @()
    if ($subs.Count -gt 0) {
        $indices = @(0, [int][Math]::Floor(($subs.Count - 1) / 2), ($subs.Count - 1)) | Select-Object -Unique
        foreach ($index in $indices) {
            $s = $subs[$index]
            $anchors += [ordered]@{
                subtitle_id = $s.id; index = $index + 1
                start = $s.start_time; end = $s.end_time
                text_en = $s.text_en; text_zh = $s.text_zh
                has_word_timestamps = $null -ne $s.words -and @($s.words).Count -gt 0
                listening_review = 'NOT_EXECUTED'; semantic_review = 'NOT_EXECUTED'
                seek_review = 'NOT_EXECUTED'
            }
        }
    }
    elseif ($meta.sample_subtitle_id) {
        $anchors += [ordered]@{
            subtitle_id = $meta.sample_subtitle_id; index = $null
            start = $meta.sample_start_time; end = $meta.sample_end_time
            text_en = $meta.sample_text_en; text_zh = $meta.sample_text_zh
            has_word_timestamps = $null -ne $meta.sample_word_timestamps -and @($meta.sample_word_timestamps).Count -gt 0
            source = 'public learning-metadata preview; not first/middle/last coverage'
            listening_review = 'NOT_EXECUTED'; semantic_review = 'NOT_EXECUTED'; seek_review = 'NOT_EXECUTED'
        }
    }
    $videos += [ordered]@{
        id = $detail.id; title = $detail.title; source_url = $detail.source_url
        duration = $detail.duration; level = $detail.difficulty_level; wpm = $detail.wpm
        storage_mode = $detail.storage_mode
        subtitle_count = $(if ($visible) { $subs.Count } else { $meta.subtitle_count })
        detail_access = $(if ($visible) { 'visible' } else { 'anonymous-restricted; not missing media or subtitles' })
        media_url_present = $(if ($visible) { [bool]($detail.video_url_1080p -or $detail.video_url_720p -or $detail.video_url_480p) } else { $null })
        invalid_time_ranges = $(if ($visible) { @($subs | Where-Object { $_.start_time -lt 0 -or $_.end_time -le $_.start_time }).Count } else { $null })
        missing_translations = $(if ($visible) { @($subs | Where-Object { [string]::IsNullOrWhiteSpace($_.text_zh) }).Count } else { $null })
        anchors = $anchors; media_playback_review = 'NOT_EXECUTED'
    }
}
$result = [ordered]@{
    captured_at_utc = [DateTime]::UtcNow.ToString('o')
    origin = $root; scope = 'public local metadata only; at most first 50 entries'
    selection = 'duration spread plus the observed Bob sample; not a statistically representative sample'
    video_count = $videos.Count
    anchor_count = @($videos | ForEach-Object { $_.anchors }).Count
    videos = $videos
}
$result | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $OutputPath -Encoding utf8
Write-Output "Captured $($result.video_count) videos / $($result.anchor_count) anchors; listening and playback review NOT_EXECUTED."
