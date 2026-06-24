# Fix all broken flat imports after component directory reorganization
# Each replacement is unambiguous: only appears in import statements

$replacements = @{
    '"@/components/VideoThumbnail"' = '"@/components/video/VideoThumbnail"'
    '"@/components/Icons"' = '"@/components/common/Icons"'
    '"@/components/SkeletonCard"' = '"@/components/common/SkeletonCard"'
    '"@/components/Sidebar"' = '"@/components/layout/Sidebar"'
    '"@/components/TopBar"' = '"@/components/layout/TopBar"'
    '"@/components/MobileTabBar"' = '"@/components/layout/MobileTabBar"'
    '"@/components/SubtitleModeTabs"' = '"@/components/subtitle/SubtitleModeTabs"'
    '"@/components/FlashcardMode"' = '"@/components/vocabulary/FlashcardMode"'
    '"@/components/TranslateMode"' = '"@/components/speaking/TranslateMode"'
    '"@/components/DictationMode"' = '"@/components/speaking/DictationMode"'
    '"@/components/FillBlankMode"' = '"@/components/speaking/FillBlankMode"'
    '"@/components/ReadingMode"' = '"@/components/speaking/ReadingMode"'
    '"@/components/ThemeProvider"' = '"@/components/common/ThemeProvider"'
    '"@/components/SidebarProvider"' = '"@/components/layout/SidebarProvider"'
    '"@/components/ThemedToaster"' = '"@/components/common/ThemedToaster"'
    '"@/components/AuthInitializer"' = '"@/components/common/AuthInitializer"'
    '"@/components/SearchDropdown"' = '"@/components/search/SearchDropdown"'
    '"@/components/NotificationDropdown"' = '"@/components/notifications/NotificationDropdown"'
}

$srcDir = "C:\Users\Administrator\Speaking\frontend\src"
$files = Get-ChildItem -Path $srcDir -Recurse -Include "*.tsx","*.ts" | Where-Object { $_.FullName -notlike "*node_modules*" }

$totalReplacements = 0

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    $original = $content
    
    foreach ($old in $replacements.Keys) {
        $new = $replacements[$old]
        if ($content.Contains($old)) {
            $content = $content.Replace($old, $new)
            $count = ([regex]::Matches($original, [regex]::Escape($old))).Count
            $totalReplacements += $count
            Write-Host "  $($file.Name): replaced '$old' -> '$new' ($count occurrences)"
        }
    }
    
    if ($content -ne $original) {
        Set-Content $file.FullName -Value $content -Encoding UTF8 -NoNewline
    }
}

Write-Host ""
Write-Host "Total replacements: $totalReplacements"
